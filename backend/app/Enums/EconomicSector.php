<?php

namespace App\Enums;

/**
 * Sectores del Sistema de Clasificación Industrial de América del Norte (SCIAN México) a 2 dígitos
 * (HU-S4-02 CA-04). Los sectores que abarcan varios códigos conservan la notación del INEGI («31-33»).
 * El frontend mantiene los mismos nombres en frontend/src/companies/catalogs.ts; si cambia este catálogo, cambia también aquel.
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

    /** Nombre oficial del sector, para las exportaciones CSV (HU-S7-02). */
    public function label(): string
    {
        return match ($this) {
            self::AGRICULTURE => 'Agricultura, cría y explotación de animales, aprovechamiento forestal, pesca y caza',
            self::MINING => 'Minería',
            self::UTILITIES => 'Generación, transmisión, distribución y comercialización de energía eléctrica, suministro de agua y de gas natural por ductos al consumidor final',
            self::CONSTRUCTION => 'Construcción',
            self::MANUFACTURING => 'Industrias manufactureras',
            self::WHOLESALE => 'Comercio al por mayor',
            self::RETAIL => 'Comercio al por menor',
            self::TRANSPORTATION => 'Transportes, correos y almacenamiento',
            self::INFORMATION => 'Información en medios masivos',
            self::FINANCE => 'Servicios financieros y de seguros',
            self::REAL_ESTATE => 'Servicios inmobiliarios y de alquiler de bienes muebles e intangibles',
            self::PROFESSIONAL => 'Servicios profesionales, científicos y técnicos',
            self::MANAGEMENT => 'Corporativos',
            self::SUPPORT => 'Servicios de apoyo a los negocios y manejo de residuos, y servicios de remediación',
            self::EDUCATION => 'Servicios educativos',
            self::HEALTH => 'Servicios de salud y de asistencia social',
            self::RECREATION => 'Servicios de esparcimiento culturales y deportivos, y otros servicios recreativos',
            self::ACCOMMODATION => 'Servicios de alojamiento temporal y de preparación de alimentos y bebidas',
            self::OTHER_SERVICES => 'Otros servicios excepto actividades gubernamentales',
            self::GOVERNMENT => 'Actividades legislativas, gubernamentales, de impartición de justicia y de organismos internacionales y extraterritoriales',
        };
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
