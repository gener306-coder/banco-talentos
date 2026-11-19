<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * HU-S14-02: la Secretaría invita a la empresa solo con el correo de su cuenta y la empresa captura su perfil.
 * Todo el perfil pasa a ser opcional, con la ubicación completa o ninguna y sin textos vacíos. Las empresas
 * existentes ya tienen su perfil: su onboarding queda terminado.
 */
return new class extends Migration
{
    private const OPTIONAL = ['legal_name', 'rfc', 'sector_code', 'state_code', 'municipality_code', 'location', 'contact_name', 'contact_email'];

    private const TEXT = ['legal_name', 'trade_name', 'rfc', 'contact_name', 'contact_position', 'contact_email', 'contact_phone', 'validation_reference'];

    public function up(): void
    {
        foreach (self::OPTIONAL as $column) {
            DB::statement("ALTER TABLE companies ALTER COLUMN {$column} DROP NOT NULL");
        }
        DB::statement('ALTER TABLE companies ADD CONSTRAINT companies_location_complete CHECK (
            (state_code IS NULL) = (municipality_code IS NULL) AND (municipality_code IS NULL) = (location IS NULL))');
        $notBlank = implode(' AND ', array_map(fn (string $column): string => "({$column} IS NULL OR btrim({$column}) <> '')", self::TEXT));
        DB::statement("ALTER TABLE companies ADD CONSTRAINT companies_text_not_blank CHECK ({$notBlank})");

        DB::statement('ALTER TABLE companies ADD COLUMN onboarding_dismissed_at timestamptz');
        DB::statement('UPDATE companies SET onboarding_dismissed_at = now()');

        DB::statement('ALTER TABLE account_audit_events DROP CONSTRAINT account_audit_events_event_check');
        DB::statement("ALTER TABLE account_audit_events ADD CONSTRAINT account_audit_events_event_check
            CHECK (event IN ('account_updated', 'password_changed', 'organization_profile_updated', 'company_invited'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE account_audit_events DROP CONSTRAINT account_audit_events_event_check');
        DB::statement("ALTER TABLE account_audit_events ADD CONSTRAINT account_audit_events_event_check
            CHECK (event IN ('account_updated', 'password_changed'))");
        DB::statement('ALTER TABLE companies DROP COLUMN onboarding_dismissed_at');
        DB::statement('ALTER TABLE companies DROP CONSTRAINT companies_text_not_blank');
        DB::statement('ALTER TABLE companies DROP CONSTRAINT companies_location_complete');
        foreach (self::OPTIONAL as $column) {
            DB::statement("ALTER TABLE companies ALTER COLUMN {$column} SET NOT NULL");
        }
    }
};
