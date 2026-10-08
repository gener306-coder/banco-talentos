<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Throwable;

class InstitutionPasswordResetLink
{
    /**
     * Crea y persiste el token (hash) dentro de la transacción en curso; invalida el anterior.
     */
    public function issue(User $user): string
    {
        $token = Password::broker('institution_reset')->createToken($user);

        return rtrim(config('app.frontend_url'), '/').'/'.ltrim(config('app.password_reset_path'), '/').'?'.http_build_query([
            'email' => $user->email,
            'token' => $token,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Envía el enlace sólo después de confirmar la transacción. El enlace nunca se
     * devuelve por HTTP, tampoco en testing: las pruebas lo inspeccionan con Notification::fake().
     */
    public function deliverAfterCommit(User $user, string $resetUrl): string
    {
        $status = 'pending';
        DB::afterCommit(function () use ($user, $resetUrl, &$status): void {
            try {
                $user->notify(new ResetInstitutionPassword($resetUrl));
                // Aceptado por el transporte; no equivale a entrega en el buzón.
                $status = 'sent';
            } catch (Throwable $exception) {
                // No registrar el token, la URL ni el mensaje del transporte.
                Log::warning('No se pudo enviar el enlace de restablecimiento de contraseña.', [
                    'user_id' => $user->id,
                    'exception_type' => $exception::class,
                ]);
            }
        });

        return $status;
    }
}
