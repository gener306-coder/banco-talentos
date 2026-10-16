<?php

namespace App\Enums;

/**
 * Nivel de idioma del Marco Común Europeo (MCER) más Nativo (HU-S3-01). Entero para filtrar por rango:
 * «inglés B2 o más» es `level >= 4`.
 */
enum LanguageLevel: int
{
    case A1 = 1;
    case A2 = 2;
    case B1 = 3;
    case B2 = 4;
    case C1 = 5;
    case C2 = 6;
    case NATIVE = 7;
}
