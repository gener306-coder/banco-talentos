<?php

namespace App\Enums;

/** Lado de una solicitud de vinculación en su conversación (HU-S13-01): el alumno nunca participa. */
enum LinkageParty: string
{
    case COMPANY = 'COMPANY';
    case INSTITUTION = 'INSTITUTION';

    /** Lado de la cuenta de la sesión; solo las cuentas COMPANY e INSTITUTION llegan a la conversación. */
    public static function of(UserRole $role): self
    {
        return match ($role) {
            UserRole::COMPANY => self::COMPANY,
            UserRole::INSTITUTION => self::INSTITUTION,
        };
    }

    /** Columna de la solicitud con el marcador de lectura de este lado. */
    public function readMarkerColumn(): string
    {
        return match ($this) {
            self::COMPANY => 'company_last_read_message_id',
            self::INSTITUTION => 'institution_last_read_message_id',
        };
    }

    /** Columna de la solicitud que la acota a la organización de este lado. */
    public function ownerColumn(): string
    {
        return match ($this) {
            self::COMPANY => 'company_id',
            self::INSTITUTION => 'institution_id',
        };
    }
}
