<?php

namespace App\Enums;

/**
 * Estado de una solicitud de vinculación Empresa → Institución (HU-S5-04). La respuesta de la institución
 * (ACEPTADA / RECHAZADA) pertenece al Sprint 6; en este Sprint toda solicitud nace PENDIENTE_INSTITUCION y la empresa
 * puede cancelarla mientras siga pendiente (HU-S5-05).
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
