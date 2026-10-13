<?php

namespace App\Enums;

/**
 * Tipo de periodo académico del expediente del alumno (HU-S2-03 CA-02).
 */
enum AcademicPeriodType: string
{
    case SEMESTER = 'semester';
    case FOUR_MONTH = 'four_month';
}
