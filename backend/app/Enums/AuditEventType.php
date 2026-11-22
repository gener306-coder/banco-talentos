<?php

namespace App\Enums;

/**
 * Tipos de evento de la bitácora administrativa (HU-S7-03 CA-02). Los primeros salen de una columna de trazabilidad
 * ya registrada; desde HU-S14-04, los cambios de cuentas y organizaciones salen de la tabla inmutable
 * account_audit_events (solo nombres de campos, nunca valores).
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
    // account_audit_events (HU-S14-01 a HU-S14-04)
    case ACCOUNT_UPDATED = 'account_updated';
    case PASSWORD_CHANGED = 'password_changed';
    case ORGANIZATION_PROFILE_UPDATED = 'organization_profile_updated';
    case COMPANY_INVITED = 'company_invited';
    // Sprint 16 (HU-S16-01 a HU-S16-04)
    case ADMIN_BOOTSTRAPPED = 'admin_bootstrapped';
    case PASSWORD_RESET_ISSUED = 'password_reset_issued';
    case EMAIL_CHANGED = 'email_changed';
    case ACCOUNT_STATUS_CHANGED = 'account_status_changed';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
