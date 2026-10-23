<?php

namespace App\Enums;

/**
 * Sectores del Sistema de Clasificación Industrial de América del Norte (SCIAN México) a 2 dígitos
 * (HU-S4-02 CA-04). Los sectores que abarcan varios códigos conservan la notación del INEGI («31-33»).
 * El frontend mantiene los nombres en frontend/src/companies/catalogs.ts; si cambia este catálogo, cambia también aquel.
 */
enum EconomicSector: string
{
    case AGRICULTURE = '11';
    case MINING = '21';
    case UTILITIES = '22';
    case CONSTRUCTION = '23';
    case MANUFACTURING = '31-33';
    case WHOLESALE = '43';
    case RETAIL = '46';
    case TRANSPORTATION = '48-49';
    case INFORMATION = '51';
    case FINANCE = '52';
    case REAL_ESTATE = '53';
    case PROFESSIONAL = '54';
    case MANAGEMENT = '55';
    case SUPPORT = '56';
    case EDUCATION = '61';
    case HEALTH = '62';
    case RECREATION = '71';
    case ACCOMMODATION = '72';
    case OTHER_SERVICES = '81';
    case GOVERNMENT = '93';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
