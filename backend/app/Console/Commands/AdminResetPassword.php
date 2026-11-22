<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\FindsAdministrator;
use App\Models\AccountAuditEvent;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionPasswordResetLink;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * HU-S16-04: restablecimiento de emergencia de una cuenta ADMIN desde la consola del servidor. Emite un enlace de 60
 * minutos y de un solo uso y cierra todas las sesiones abiertas. A una cuenta que aún no configura su contraseña le
 * emite de nuevo su enlace de configuración.
 */
class AdminResetPassword extends Command
{
    use FindsAdministrator;

    protected $signature = 'admin:reset-password
        {email : Correo de acceso de la cuenta de Administración}
        {--manual : Imprimir el enlace en la terminal en lugar de enviarlo por correo}';

    protected $description = 'Emite un enlace para restablecer la contraseña de un Administrador y cierra sus sesiones.';

    public function handle(InstitutionPasswordResetLink $resets, InitialPasswordLink $setups): int
    {
        $result = DB::transaction(function () use ($resets, $setups): array|string {
            $admin = $this->lockedAdministrator((string) $this->argument('email'));
            if ($admin === null) {
                return 'No hay una cuenta de Administración con ese correo. Consulta las cuentas con: php artisan admin:list';
            }
            if (! $admin->is_active) {
                return 'La cuenta de Administración está inactiva. Reactívala desde Cuentas de Administración antes de restablecerla.';
            }

            $setup = $admin->password_setup_required;
            $url = $setup ? $setups->issue($admin) : $resets->issue($admin);
            $this->revokeAccess($admin, keepBroker: $setup ? 'institution_setup' : 'institution_reset');
            AccountAuditEvent::recordFromConsole(AccountAuditEvent::PASSWORD_RESET_ISSUED, $admin);

            return [$admin, $url, $setup];
        });

        if (is_string($result)) {
            $this->error($result);

            return self::FAILURE;
        }
        /** @var array{0: User, 1: string, 2: bool} $result */
        [$admin, $url, $setup] = $result;
        $manual = (bool) $this->option('manual');
        Log::notice('Restablecimiento de emergencia de un Administrador desde la consola.', [
            'user_id' => $admin->id, 'kind' => $setup ? 'setup' : 'reset', 'delivery' => $manual ? 'manual' : 'email',
        ]);

        if ($manual) {
            $this->info('Sesiones cerradas para '.$admin->email.'.');
            $this->line('Comparte este enlace solo con esa persona. Vence en 60 minutos y se usa una sola vez:');
            $this->line($url);

            return self::SUCCESS;
        }

        $status = $setup
            ? $setups->deliverAfterCommit($admin, $url)
            : $resets->deliverAfterCommit($admin, $url, ResetInstitutionPassword::CONSOLE_INITIATOR);
        if ($status !== 'sent') {
            $this->warn('Las sesiones se cerraron, pero el correo no se pudo enviar. Repite el comando con --manual.');

            return self::FAILURE;
        }
        $this->info('Sesiones cerradas y enlace enviado a '.$admin->email.' (vence en 60 minutos).');

        return self::SUCCESS;
    }
}
