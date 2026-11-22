<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Command;

/** HU-S16-04: cuentas de Administración, para la recuperación de emergencia. Sin contraseñas ni tokens. */
class AdminList extends Command
{
    protected $signature = 'admin:list';

    protected $description = 'Lista las cuentas de Administración, su estado y su fecha de alta.';

    public function handle(): int
    {
        $admins = User::query()->where('role', UserRole::ADMIN)->orderBy('id')
            ->get(['id', 'name', 'email', 'is_active', 'password_setup_required', 'created_at']);

        if ($admins->isEmpty()) {
            $this->warn('No hay cuentas de Administración. Crea la primera con: php artisan admin:bootstrap <correo>');

            return self::SUCCESS;
        }

        $this->table(['Id', 'Nombre', 'Correo', 'Estado', 'Contraseña', 'Alta'], $admins->map(fn (User $admin): array => [
            $admin->id,
            $admin->name,
            $admin->email,
            $admin->is_active ? 'Activa' : 'Inactiva',
            $admin->password_setup_required ? 'Pendiente de configurar' : 'Configurada',
            $admin->created_at?->toDateString(),
        ])->all());

        return self::SUCCESS;
    }
}
