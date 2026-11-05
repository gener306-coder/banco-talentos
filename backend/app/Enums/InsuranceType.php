<?php

namespace App\Enums;

/**
 * Tipo de seguro del alumno (T-S8-07): solo el IMSS tiene un formato de número conocido.
 */
enum InsuranceType: string
{
    case IMSS = 'IMSS';
    case OTHER = 'OTHER';
}
