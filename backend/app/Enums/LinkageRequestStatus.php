<?php

namespace App\Enums;

/**
 * Estado de una solicitud de vinculación Empresa → Institución (HU-S5-04). Toda solicitud nace PENDIENTE_INSTITUCION;
 * mientras siga pendiente, la empresa puede cancelarla (HU-S5-05) y la institución aceptarla o rechazarla (HU-S6-02).
 */
enum LinkageRequestStatus: string
{
    case PENDING_INSTITUTION = 'PENDIENTE_INSTITUCION';
    case ACCEPTED = 'ACEPTADA';
    case REJECTED = 'RECHAZADA';
    // La empresa la retiró mientras estaba pendiente (HU-S5-05 CA-03).
    case CANCELLED = 'CANCELADA';

    /** Estados que impiden repetir la solicitud de la misma empresa, alumno y oportunidad (CA-03). */
    public const ACTIVE = [self::PENDING_INSTITUTION, self::ACCEPTED];
}
