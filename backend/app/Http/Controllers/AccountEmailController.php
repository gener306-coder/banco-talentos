<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\RequestAccessEmailChangeRequest;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\AccessEmailChanged;
use App\Services\AccessEmailLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Correo de acceso de la persona de la sesión, para los 4 roles.
 *
 * - T-S19-03: cambio con correo pendiente y enlace de un solo uso a la dirección nueva. El correo actual sigue activo
 *   hasta confirmar; otra solicitud reemplaza la pendiente.
 * - T-S19-04: verificación del correo actual con el mismo tipo de enlace.
 * - La confirmación es pública (con o sin sesión): el enlace es la prueba de que se controla el buzón.
 */
class AccountEmailController extends Controller
{
    public function __construct(private readonly AccessEmailLink $links, private readonly AuthController $auth) {}

    public function request(RequestAccessEmailChangeRequest $request): JsonResponse
    {
        $email = $request->validated('email');

        [$user, $url] = DB::transaction(function () use ($request, $email): array {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);

            return [$user, $this->links->issue($user, $email)];
        });
        $this->links->warnCurrentAddress($user, $email);

        return $this->respond($user, $this->links->deliverAfterCommit($user, $url));
    }

    /** Reenvía el enlace vigente (cambio o verificación) con un token nuevo; el anterior deja de servir. */
    public function resend(Request $request): JsonResponse
    {
        [$user, $url] = DB::transaction(function () use ($request): array {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            if ($user->email_token_hash === null) {
                throw ValidationException::withMessages(['email' => ['No hay ningún enlace de confirmación pendiente.']]);
            }
            $this->ensureCooldown($user);

            return [$user, $this->links->issue($user, $user->pending_email)];
        });

        return $this->respond($user, $this->links->deliverAfterCommit($user, $url));
    }

    public function cancel(Request $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request): User {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            if ($user->pending_email !== null) {
                $user->forgetEmailToken();
                $user->save();
            }

            return $user;
        });

        return $this->auth->userResponse($user);
    }

    /** T-S19-04: enlace para verificar el correo actual; no aplica con un cambio pendiente ni a un correo ya verificado. */
    public function verification(Request $request): JsonResponse
    {
        [$user, $url] = DB::transaction(function () use ($request): array {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            if ($user->email_verified_at !== null) {
                throw ValidationException::withMessages(['email' => ['Tu correo de acceso ya está verificado.']]);
            }
            if ($user->pending_email !== null) {
                throw ValidationException::withMessages(['email' => ['Tienes un cambio de correo pendiente: confírmalo o cancélalo primero.']]);
            }
            $this->ensureCooldown($user);

            return [$user, $this->links->issue($user, null)];
        });

        return $this->respond($user, $this->links->deliverAfterCommit($user, $url));
    }

    public function confirm(Request $request): JsonResponse
    {
        $token = $request->input('token');
        if (! is_string($token) || strlen($token) !== 64) {
            return $this->invalidLink();
        }
        $current = Auth::guard('web')->user();

        $result = DB::transaction(function () use ($token, $request, $current): array|JsonResponse {
            $user = $this->links->find($token, lock: true);
            if ($user === null || ! $user->is_active) {
                return $this->invalidLink();
            }

            $pending = $user->pending_email;
            if ($pending === null) {
                $user->forgetEmailToken();
                $user->email_verified_at ??= now();
                $user->save();

                return ['verified', $user, null];
            }

            if (User::query()->where('email', $pending)->exists()) {
                // El cambio ya no puede completarse: se descarta para que Mi cuenta no lo siga mostrando.
                $user->forgetEmailToken();
                $user->save();

                return response()->json([
                    'code' => 'EMAIL_TAKEN',
                    'message' => 'Ese correo ya fue registrado en otra cuenta. Tu correo de acceso no cambió.',
                ], 409)->header('Cache-Control', 'no-store, private');
            }

            $previous = $user->email;
            // Los enlaces de contraseña están ligados al correo anterior: se borran antes del cambio.
            foreach (['institution_reset', 'institution_setup'] as $broker) {
                Password::broker($broker)->getRepository()->delete($user);
            }
            $user->forgetEmailToken();
            $user->email = $pending;
            $user->email_verified_at = now();
            $user->setRememberToken(Str::random(60));
            $user->save();

            // Las demás sesiones se cierran; la de este navegador, si es de la misma cuenta, sigue abierta.
            $keep = $current?->getAuthIdentifier() === $user->id ? $request->session()->getId() : null;
            DB::table('sessions')->where('user_id', $user->id)->when($keep !== null, fn ($query) => $query->where('id', '!=', $keep))->delete();

            AccountAuditEvent::record($user, AccountAuditEvent::EMAIL_CHANGED, $user, ['email']);
            $this->syncOrganizationContact($user, $previous);

            return ['changed', $user, $previous];
        });

        if ($result instanceof JsonResponse) {
            return $result;
        }
        [$outcome, $user, $previous] = $result;
        if ($outcome === 'changed') {
            if ($current?->getAuthIdentifier() === $user->id) {
                $request->session()->regenerate(true);
            }
            Notification::route('mail', $previous)->notify(new AccessEmailChanged(toPreviousAddress: true));
            $user->notify(new AccessEmailChanged(toPreviousAddress: false));
        }

        return response()->json(['result' => $outcome, 'email' => $user->email])->header('Cache-Control', 'no-store, private');
    }

    /** D8: si el contacto de la organización era el correo anterior, pasa al nuevo y se registra en la bitácora. */
    private function syncOrganizationContact(User $user, string $previous): void
    {
        $organization = match (true) {
            $user->role === UserRole::COMPANY && $user->company_id !== null => Company::query()->whereKey($user->company_id)->lockForUpdate()->first(),
            $user->role === UserRole::INSTITUTION && $user->institution_id !== null => Institution::query()->whereKey($user->institution_id)->lockForUpdate()->first(),
            default => null,
        };
        if ($organization !== null && $organization->contact_email !== null && mb_strtolower($organization->contact_email) === $previous) {
            $organization->contact_email = $user->email;
            $organization->save();
            AccountAuditEvent::record($user, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $organization, ['contact_email']);
        }
    }

    private function ensureCooldown(User $user): void
    {
        $wait = $this->links->cooldown($user);
        if ($wait > 0) {
            throw ValidationException::withMessages(['email' => ["Espera {$wait} segundos para enviar otro enlace."]]);
        }
    }

    private function respond(User $user, string $status): JsonResponse
    {
        $response = $this->auth->userResponse($user);

        return $response->setData([...$response->getData(true), 'email_link_delivery' => $status]);
    }

    private function invalidLink(): JsonResponse
    {
        return response()->json([
            'code' => 'EMAIL_LINK_INVALID',
            'message' => 'El enlace no es válido: venció, ya se usó o el cambio se canceló.',
        ], 422)->header('Cache-Control', 'no-store, private');
    }
}
