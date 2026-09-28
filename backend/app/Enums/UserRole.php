<?php

namespace App\Enums;

enum UserRole: string
{
    case ADMIN = 'ADMIN';
    case INSTITUTION = 'INSTITUTION';
    case COMPANY = 'COMPANY';
    case SECRETARY = 'SECRETARY';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
