<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\InstitutionPasswordResetLink;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

/**
 * Estado y restablecimiento de contraseña de cuentas SECRETARY y COMPANY (HU-S6-04). Cada controlador acota las cuentas
 * a las que puede llegar; una fuera de ese alcance responde 404, igual que una inexistente.
 */
trait ManagesAccountAccess
{
    private const PENDING_SETUP = 'La cuenta aún no ha establecido su contraseña inicial. Reenvía el enlace de configuración.';

    /**
     * CA-01, CA-03: solo cuentas que ya configuraron su contraseña (una pendiente se gestiona reenviando su enlace) y
     * nunca la propia cuenta de la sesión. El middleware `active` cierra la sesión de la cuenta inactivada en su
     * siguiente petición y el inicio de sesión la rechaza.
     */
    private function changeAccountStatus(Request $request, Builder $accounts, string $id, bool $active, ?Closure $guard = null): User
    {
        return DB::transaction(function () use ($request, $accounts, $id, $active, $guard): User {
            $account = $accounts->lockForUpdate()->find((int) $id);
            abort_if($account === null, 404, 'La cuenta no existe.');
            $guard?->__invoke();

            if (! $active && $account->is($request->user())) {
                throw ValidationException::withMessages(['is_active' => ['No puedes inactivar tu propia cuenta.']]);
            }
            if ($account->password_setup_required) {
                throw ValidationException::withMessages(['is_active' => [self::PENDING_SETUP]]);
            }
            $account->is_active = $active;
            $account->save();

            return $account;
        });
    }

    /**
     * CA-02, CA-03: mismas reglas que HU-S1-04 (enlace de un solo uso de 60 minutos y un minuto entre envíos). No
     * recibe ni devuelve contraseñas, tokens ni enlaces.
     */
    private function startAccountReset(Builder $accounts, string $email, InstitutionPasswordResetLink $links, string $initiator, Closure $notFound, ?Closure $guard = null): JsonResponse
    {
        [$account, $resetUrl] = DB::transaction(function () use ($accounts, $email, $links, $notFound, $guard): array {
            $account = $accounts->where('email', $email)->lockForUpdate()->first();
            if ($account === null) {
                $notFound();
            }
            $guard?->__invoke();
            if (! $account->is_active) {
                throw ValidationException::withMessages(['email' => ['La cuenta está inactiva: actívala antes de restablecer su contraseña.']]);
            }
            if ($account->password_setup_required) {
                throw ValidationException::withMessages(['email' => [self::PENDING_SETUP]]);
            }
            // Se aplica bajo bloqueo y sobre el token persistido; no depende del proceso HTTP.
            if (Password::broker('institution_reset')->getRepository()->recentlyCreatedToken($account)) {
                throw new TooManyRequestsHttpException(60, 'Espera un minuto antes de volver a iniciar el restablecimiento.');
            }

            return [$account, $links->issue($account)];
        });

        return response()->json([
            'reset_delivery' => $links->deliverAfterCommit($account, $resetUrl, $initiator),
        ])->header('Cache-Control', 'no-store, private');
    }
}
