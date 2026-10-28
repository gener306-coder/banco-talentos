<?php

namespace App\Enums;

/**
 * Estado de una solicitud de vinculación Empresa → Institución (HU-S5-04). La respuesta de la institución
 * (ACEPTADA / RECHAZADA) pertenece al Sprint 6; en este Sprint toda solicitud nace PENDIENTE_INSTITUCION.
 */
enum LinkageRequestStatus: string
{
    case PENDING_INSTITUTION = 'PENDIENTE_INSTITUCION';
    case ACCEPTED = 'ACEPTADA';
    case REJECTED = 'RECHAZADA';

    /** Estados que impiden repetir la solicitud de la misma empresa, alumno y oportunidad (CA-03). */
    public const ACTIVE = [self::PENDING_INSTITUTION, self::ACCEPTED];
}
