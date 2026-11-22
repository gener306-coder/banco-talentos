<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Notifications\ResetInstitutionPassword;

/**
 * Cuentas de la Secretaría de Economía (HU-S4-01): ADMIN y SECRETARY las listan, crean y reenvían su enlace de
 * configuración; desde HU-S6-04 las activan o inactivan e inician su restablecimiento de contraseña.
 */
class SecretaryAccountController extends SetupRoleAccountController
{
    protected function role(): UserRole
    {
        return UserRole::SECRETARY;
    }

    protected function noun(): string
    {
        return 'de la Secretaría';
    }

    protected function resetInitiator(): string
    {
        return ResetInstitutionPassword::SECRETARY_INITIATOR;
    }
}
