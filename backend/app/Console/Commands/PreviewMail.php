<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Notifications\AccessEmailChanged;
use App\Notifications\AccessEmailChangeRequested;
use App\Notifications\ConfirmAccessEmail;
use App\Notifications\LinkageMessageReceived;
use App\Notifications\PasswordChanged;
use App\Notifications\ResetInstitutionPassword;
use App\Notifications\SetInitialPassword;
use Illuminate\Console\Command;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Validator;

/**
 * T-S18-05: vista previa de los correos de la plataforma con datos de ejemplo, antes de desplegar.
 *
 * - Sin opciones, guarda cada correo como HTML en storage/app/mail-previews para abrirlo en el navegador.
 * - Con --send=<correo>, además los envía por el mailer configurado. En desarrollo es Mailpit (http://localhost:8025),
 *   cuya pestaña «HTML Check» dice qué clientes de correo soportan cada elemento.
 *
 * Nunca corre en producción: los datos son de ejemplo y un envío por error llegaría a una persona real.
 */
class PreviewMail extends Command
{
    protected $signature = 'mail:preview
        {--send= : Además, envía los correos a esta dirección por el mailer configurado (Mailpit en desarrollo)}';

    protected $description = 'Genera la vista previa de los correos de la plataforma con datos de ejemplo.';

    public function handle(): int
    {
        if ($this->laravel->environment('production')) {
            $this->error('La vista previa de correos no se ejecuta en producción.');

            return self::FAILURE;
        }

        $to = $this->option('send');
        if ($to !== null && Validator::make(['to' => $to], ['to' => ['required', 'email']])->fails()) {
            $this->error('Indica un correo válido en --send.');

            return self::FAILURE;
        }

        $directory = storage_path('app/mail-previews');
        File::ensureDirectoryExists($directory);
        $recipient = new User(['name' => 'Ana López', 'email' => $to ?? 'ana.lopez@example.test']);

        foreach ($this->samples() as $name => $notification) {
            $path = "{$directory}/{$name}.html";
            File::put($path, (string) $notification->toMail($recipient)->render());
            $this->line("  {$name}: {$path}");
            if ($to !== null) {
                $recipient->notifyNow($notification, ['mail']);
            }
        }

        $this->info($to === null
            ? 'Vista previa guardada. Abre los archivos en el navegador.'
            : "Vista previa guardada y enviada a {$to}.");

        return self::SUCCESS;
    }

    /** @return array<string, Notification> Un ejemplo por correo y por variante de texto. */
    private function samples(): array
    {
        $app = rtrim((string) config('app.frontend_url'), '/');
        $link = fn (string $path): string => $app.$path.'?email=ana.lopez%40example.test&token=ejemplo-de-un-solo-uso';

        return [
            'contrasena-inicial' => new SetInitialPassword($link('/set-initial-password')),
            'restablecimiento-administracion' => new ResetInstitutionPassword($link('/reset-password')),
            'restablecimiento-olvide' => new ResetInstitutionPassword($link('/reset-password'), ResetInstitutionPassword::SELF_INITIATOR),
            'contrasena-cambiada' => new PasswordChanged,
            'correo-de-acceso-nuevo' => new AccessEmailChanged(false),
            'correo-de-acceso-anterior' => new AccessEmailChanged(true),
            'confirmar-correo-nuevo' => new ConfirmAccessEmail($app.'/confirm-email?token=ejemplo-de-un-solo-uso', 'Ana López', change: true),
            'verificar-correo' => new ConfirmAccessEmail($app.'/confirm-email?token=ejemplo-de-un-solo-uso', 'Ana López', change: false),
            'aviso-cambio-de-correo' => new AccessEmailChangeRequested('ana.nueva@example.test'),
            'mensaje-de-vinculacion' => new LinkageMessageReceived('ManuGolfo', 'Tableros de producción', $app.'/linkage-requests/41/chat'),
        ];
    }
}
