<?php

namespace App\Services;

use App\Enums\SetupDeliveryMethod;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Throwable;

class InitialPasswordLink
{
    public function issue(User $user): string
    {
        $token = Password::broker('institution_setup')->createToken($user);

        return rtrim(config('app.frontend_url'), '/').'/set-initial-password?'.http_build_query([
            'email' => $user->email,
            'token' => $token,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Campos de entrega para la respuesta HTTP del alta o del reenvío.
     *
     * Manual (HU-S2-01): no se programa ningún correo y el enlace se devuelve al ADMIN
     * para que lo comparta; se audita quién lo pidió, sin registrar el token ni la URL.
     * Email: comportamiento del Sprint 1; el enlace solo se devuelve en testing (E2E).
     */
    public function deliver(User $user, string $setupUrl, SetupDeliveryMethod $method, int $adminId): array
    {
        if ($method === SetupDeliveryMethod::MANUAL) {
            Log::notice('Enlace de configuración inicial generado para entrega manual.', [
                'admin_id' => $adminId,
                'user_id' => $user->id,
            ]);

            return ['setup_delivery' => 'manual', 'setup_url' => $setupUrl];
        }

        $fields = ['setup_delivery' => $this->deliverAfterCommit($user, $setupUrl)];
        if (app()->environment('testing')) {
            $fields['setup_url'] = $setupUrl;
        }

        return $fields;
    }

    public function deliverAfterCommit(User $user, string $setupUrl): string
    {
        if (app()->environment('testing')) {
            return 'testing';
        }

        $status = 'pending';
        DB::afterCommit(function () use ($user, $setupUrl, &$status): void {
            try {
                $user->notify(new SetInitialPassword($setupUrl));
                // Aceptado por el transporte; no equivale a entrega en el buzón.
                $status = 'sent';
            } catch (Throwable $exception) {
                // La cuenta ya está confirmada. El ADMIN puede reenviar el enlace
                // sin conocerlo; no registrar secretos ni el mensaje del transporte.
                Log::warning('No se pudo enviar el enlace de configuración inicial.', [
                    'user_id' => $user->id,
                    'exception_type' => $exception::class,
                ]);
            }
        });

        return $status;
    }
}
