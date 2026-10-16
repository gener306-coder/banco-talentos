<?php

namespace App\Enums;

/**
 * Idiomas del CV con su clave ISO 639-1 (HU-S3-01). Lista corta de los más comunes en el entorno profesional;
 * ampliable (la columna admite tres letras). El frontend mantiene los nombres en frontend/src/students/cvCatalogs.ts.
 */
enum CvLanguage: string
{
    case ENGLISH = 'en';
    case SPANISH = 'es';
    case FRENCH = 'fr';
    case GERMAN = 'de';
    case PORTUGUESE = 'pt';
    case ITALIAN = 'it';
    case CHINESE = 'zh';
    case JAPANESE = 'ja';
    case KOREAN = 'ko';
    case RUSSIAN = 'ru';
    case ARABIC = 'ar';
    case HINDI = 'hi';
    case DUTCH = 'nl';
    case SWEDISH = 'sv';
    case NORWEGIAN = 'no';
    case DANISH = 'da';
    case FINNISH = 'fi';
    case POLISH = 'pl';
    case TURKISH = 'tr';
    case GREEK = 'el';
    case HEBREW = 'he';
    case CATALAN = 'ca';
}
