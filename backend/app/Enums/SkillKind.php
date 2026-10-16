<?php

namespace App\Enums;

/**
 * Tipo de habilidad del catálogo (HU-S3-01 CA-01). Lo fija el catálogo: quien la registra primero lo elige
 * y se respeta al reutilizarla.
 */
enum SkillKind: string
{
    case TECHNICAL = 'technical';
    case SOFT = 'soft';
}
