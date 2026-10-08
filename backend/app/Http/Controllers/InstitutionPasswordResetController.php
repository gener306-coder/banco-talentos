<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Exceptions\AccountAccessDenied;
use App\Http\Requests\ResetInstitutionPasswordRequest;
use App\Http\Requests\StartInstitutionPasswordResetRequest;
use App\Models\Institution;
use App\Models\User;
use App\Services\InstitutionPasswordResetLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

class InstitutionPasswordResetController extends Controller
{
    /**
     * ADMIN inicia el restablecimiento. No recibe ni devuelve contraseñas, tokens ni enlaces.
     */
    public function start(StartInstitutionPasswordResetRequest $request, InstitutionPasswordResetLink $links): JsonResponse
    {
        $data = $request->validated();
        [$user, $resetUrl] = DB::transaction(function () use ($data, $links): array {
            // Mismo orden de bloqueos que al consumir el enlace: usuario e institución.
            $user = User::query()->where('email', $data['email'])->lockForUpdate()->first();
            if (! $user || $user->role !== UserRole::INSTITUTION || $user->institution_id !== (int) $data['institution_id']) {
                throw ValidationException::withMessages([
                    'email' => ['No hay una cuenta institucional con ese correo en esta institución.'],
                ]);
            }
            if (! $user->is_active) {
                throw ValidationException::withMessages([
                    'email' => ['La cuenta institucional está inactiva.'],
                ]);
            }
            if ($user->password_setup_required) {
                throw ValidationException::withMessages([
                    'email' => ['La cuenta aún no ha establecido su contraseña inicial. Reenvía el enlace de configuración.'],
                ]);
            }

            $institution = Institution::query()->lockForUpdate()->find($user->institution_id);
            if (! $institution || ! $institution->is_active) {
                throw ValidationException::withMessages([
                    'institution_id' => ['La institución no existe o no está activa.'],
                ]);
            }

            // Se aplica bajo bloqueo y sobre el token persistido; no depende del proceso HTTP.
            if (Password::broker('institution_reset')->getRepository()->recentlyCreatedToken($user)) {
                throw new TooManyRequestsHttpException(60, 'Espera un minuto antes de volver a iniciar el restablecimiento.');
            }

            return [$user, $links->issue($user)];
        });

        return response()->json([
            'reset_delivery' => $links->deliverAfterCommit($user, $resetUrl),
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * La persona titular establece su nueva contraseña con el token recibido por correo.
     */
    public function reset(ResetInstitutionPasswordRequest $request): Response
    {
        $data = $request->validated();

        DB::transaction(function () use ($data): void {
            // Serializa el consumo: dos envíos simultáneos no pueden usar el mismo token.
            $user = User::query()->where('email', $data['email'])->lockForUpdate()->first();
            $broker = Password::broker('institution_reset');
            if (! $user || $user->role !== UserRole::INSTITUTION || ! $user->institution_id
                || $user->password_setup_required || ! $broker->tokenExists($user, $data['token'])) {
                $this->invalidToken();
            }

            $institution = Institution::query()->lockForUpdate()->find($user->institution_id);
            if (! $institution || ! $institution->is_active) {
                throw new AccountAccessDenied('INSTITUTION_INACTIVE', 403);
            }
            if (! $user->is_active) {
                throw new AccountAccessDenied('ACCOUNT_INACTIVE', 403);
            }

            $status = $broker->reset($data, function (User $account, string $password): void {
                // Tratar incluso una cadena con formato bcrypt como contraseña literal.
                // El nuevo hash invalida las sesiones por cookie existentes (AuthenticateSession).
                $account->password = Hash::make($password);
                $account->save();
            });
            if ($status !== Password::PASSWORD_RESET) {
                $this->invalidToken();
            }
        });

        // No inicia sesión automáticamente ni altera la sesión de otro usuario.
        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }

    private function invalidToken(): never
    {
        throw ValidationException::withMessages([
            'token' => ['El enlace de restablecimiento no es válido o ha expirado.'],
        ]);
    }
}
