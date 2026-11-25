<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\FindsAdministrator;
use App\Models\AccountAuditEvent;
use App\Models\User;
use App\Notifications\AccessEmailChanged;
use Illuminate\Console\Command;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * HU-S16-04 (D4): corrige el correo de acceso de una cuenta ADMIN que perdió su buzón. Solo cuentas ADMIN; el correo de
 * las demás sigue en solo lectura (D5 del Sprint 14). Cierra las sesiones, invalida los enlaces pendientes y avisa a la
 * dirección anterior y a la nueva. La bitácora registra el cambio sin los valores.
 */
class AdminUpdateEmail extends Command
{
    use FindsAdministrator;

    protected $signature = 'admin:update-email
        {current : Correo de acceso actual de la cuenta de Administración}
        {new : Correo de acceso nuevo}';

    protected $description = 'Cambia el correo de acceso de un Administrador y cierra sus sesiones.';

    public function handle(): int
    {
        $new = Str::lower(trim((string) $this->argument('new')));
        $validator = Validator::make(['email' => $new], ['email' => ['required', 'string', 'email', 'max:254']], [
            'email.email' => 'El correo nuevo no es válido.',
            'email.required' => 'Indica el correo nuevo.',
            'email.max' => 'El correo nuevo no debe superar 254 caracteres.',
        ]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }

        try {
            $result = DB::transaction(function () use ($new): array|string {
                $admin = $this->lockedAdministrator((string) $this->argument('current'));
                if ($admin === null) {
                    return 'No hay una cuenta de Administración con ese correo. Consulta las cuentas con: php artisan admin:list';
                }
                if ($admin->email === $new) {
                    return 'El correo nuevo es igual al actual.';
                }
                if (User::query()->where('email', $new)->exists()) {
                    return 'El correo nuevo ya está registrado en otra cuenta.';
                }

                $previous = $admin->email;
                // Los enlaces pendientes están ligados al correo anterior: se invalidan antes del cambio.
                $this->revokeAccess($admin);
                $admin->email = $new;
                // D9 (T-S19-04): sigue siendo inmediato para recuperar el acceso, pero el correo nuevo queda sin verificar
                // y se descarta cualquier cambio pendiente desde Mi cuenta.
                $admin->email_verified_at = null;
                $admin->forgetEmailToken();
                $admin->save();
                AccountAuditEvent::recordFromConsole(AccountAuditEvent::EMAIL_CHANGED, $admin, ['email']);

                return [$admin, $previous];
            });
        } catch (UniqueConstraintViolationException) {
            $this->error('El correo nuevo ya está registrado en otra cuenta.');

            return self::FAILURE;
        }

        if (is_string($result)) {
            $this->error($result);

            return self::FAILURE;
        }
        [$admin, $previous] = $result;
        Notification::route('mail', $previous)->notify(new AccessEmailChanged(toPreviousAddress: true));
        $admin->notify(new AccessEmailChanged(toPreviousAddress: false));
        Log::notice('Correo de acceso de un Administrador cambiado desde la consola.', ['user_id' => $admin->id]);
        $this->info('Correo de acceso actualizado y sesiones cerradas. Se avisó a la dirección anterior y a la nueva.');

        return self::SUCCESS;
    }
}
