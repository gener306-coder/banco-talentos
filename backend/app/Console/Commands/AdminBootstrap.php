<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\User;
use App\Services\InitialPasswordLink;
use Illuminate\Console\Command;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * HU-S16-01: arranque seguro del primer Administrador desde la consola del servidor (D1: no hay ruta pública /setup).
 * Crea la cuenta con la contraseña pendiente de configurar y emite el enlace de /set-initial-password (60 minutos, de un
 * solo uso). Se niega si ya existe un Administrador activo: a partir de ahí, los Administradores se invitan desde la
 * plataforma (HU-S16-02) o se recuperan con los comandos de emergencia (HU-S16-04).
 */
class AdminBootstrap extends Command
{
    protected $signature = 'admin:bootstrap
        {email : Correo de acceso del primer Administrador}
        {--name= : Nombre de la persona (si se omite, el correo hasta que lo capture)}
        {--manual : Imprimir el enlace en la terminal en lugar de enviarlo por correo}';

    protected $description = 'Crea el primer Administrador y emite su enlace para establecer la contraseña.';

    /** Llave del bloqueo de PostgreSQL que serializa dos arranques simultáneos. */
    private const LOCK_KEY = 160101;

    public function handle(InitialPasswordLink $links): int
    {
        $email = Str::lower(trim((string) $this->argument('email')));
        $name = trim((string) ($this->option('name') ?? ''));
        $validator = Validator::make(['email' => $email, 'name' => $name], [
            'email' => ['required', 'string', 'email', 'max:254'],
            'name' => ['nullable', 'string', 'max:120'],
        ], [
            'email.email' => 'El correo electrónico no es válido.',
            'email.required' => 'Indica el correo del Administrador.',
            'name.max' => 'El nombre no debe superar 120 caracteres.',
        ]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($email, $name, $links): array {
                DB::select('SELECT pg_advisory_xact_lock(?)', [self::LOCK_KEY]);
                if (User::query()->where('role', UserRole::ADMIN)->where('is_active', true)->exists()) {
                    return [null, null];
                }

                $user = new User([
                    // M3: sin nombre, el correo como nombre provisional.
                    'name' => $name !== '' ? $name : $email,
                    'email' => $email,
                    'role' => UserRole::ADMIN,
                    'is_active' => true,
                    // Cumple NOT NULL sin dar una credencial utilizable.
                    'password' => Str::random(64),
                ]);
                $user->password_setup_required = true;
                $user->save();
                AccountAuditEvent::recordFromConsole(AccountAuditEvent::ADMIN_BOOTSTRAPPED, $user);

                return [$user, $links->issue($user)];
            });
        } catch (UniqueConstraintViolationException) {
            $this->error('El correo electrónico ya está registrado en otra cuenta.');

            return self::FAILURE;
        }

        if ($user === null) {
            $this->error('Ya existe un Administrador activo. Invita a los demás desde la plataforma (Cuentas de Administración) o usa admin:reset-password.');

            return self::FAILURE;
        }

        // Sin el token ni la URL: solo quién y cómo.
        Log::notice('Primer Administrador creado desde la consola.', ['user_id' => $user->id, 'delivery' => $this->option('manual') ? 'manual' : 'email']);

        if ($this->option('manual')) {
            $this->info('Administrador creado: '.$user->email);
            $this->line('Comparte este enlace solo con esa persona. Vence en 60 minutos y se usa una sola vez:');
            $this->line($setupUrl);

            return self::SUCCESS;
        }

        $status = $links->deliverAfterCommit($user, $setupUrl);
        if ($status !== 'sent') {
            $this->warn('Administrador creado, pero el correo no se pudo enviar. Vuelve a emitir el enlace con: php artisan admin:reset-password '.$user->email.' --manual');

            return self::FAILURE;
        }
        $this->info('Administrador creado: '.$user->email.'. Se envió el enlace para establecer la contraseña (vence en 60 minutos).');

        return self::SUCCESS;
    }
}
