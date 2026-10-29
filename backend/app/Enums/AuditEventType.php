<?php

namespace App\Enums;

/**
 * Tipos de evento de la bitácora administrativa (HU-S7-03 CA-02). Cada uno sale de una columna de trazabilidad ya
 * registrada: no hay tabla de eventos propia.
 */
enum AuditEventType: string
{
    // users.created_by
    case ACCOUNT_CREATED = 'account_created';
    // companies.registered_by
    case COMPANY_REGISTERED = 'company_registered';
    // opportunities.created_by
    case OPPORTUNITY_CREATED = 'opportunity_created';
    // linkage_requests.requested_by
    case LINKAGE_REQUESTED = 'linkage_requested';
    // linkage_requests.responded_by
    case LINKAGE_RESPONDED = 'linkage_responded';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
