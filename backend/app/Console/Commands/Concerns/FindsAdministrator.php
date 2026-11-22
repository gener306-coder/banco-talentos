<?php

namespace App\Console\Commands\Concerns;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/** HU-S16-04: búsqueda de una cuenta ADMIN por su correo y cierre de todo su acceso vigente. */
trait FindsAdministrator
{
    /** La cuenta ADMIN con ese correo, bloqueada para la transacción en curso; null si no existe o no es ADMIN. */
    private function lockedAdministrator(string $email): ?User
    {
        return User::query()->where('email', Str::lower(trim($email)))->where('role', UserRole::ADMIN)->lockForUpdate()->first();
    }

    /**
     * Cierra todas las sesiones abiertas, rota remember_token e invalida los enlaces pendientes, como al cambiar la
     * contraseña (HU-S14-01 CA-04). `$keepBroker` conserva los tokens del enlace que se acaba de emitir.
     */
    private function revokeAccess(User $user, ?string $keepBroker = null): void
    {
        DB::table('sessions')->where('user_id', $user->id)->delete();
        $user->setRememberToken(Str::random(60));
        $user->save();
        foreach (['institution_reset', 'institution_setup'] as $broker) {
            if ($broker !== $keepBroker) {
                Password::broker($broker)->getRepository()->delete($user);
            }
        }
    }
}
