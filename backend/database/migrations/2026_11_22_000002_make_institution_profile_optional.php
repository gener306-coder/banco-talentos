<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * HU-S16-05: como las empresas (HU-S14-02), Administración invita a la institución solo con el correo de su cuenta y la
 * institución captura su perfil. El nombre, el CCT y el correo del contacto pasan a ser opcionales (el nombre del
 * contacto ya lo era), sin textos vacíos. Las instituciones existentes ya tienen su perfil: su onboarding queda
 * terminado (D7). La bitácora registra la invitación (`institution_invited`).
 */
return new class extends Migration
{
    private const OPTIONAL = ['name', 'cct', 'contact_email'];

    private const TEXT = ['name', 'cct', 'contact_name', 'contact_position', 'contact_email', 'contact_phone'];

    private const EVENTS = [
        'account_updated', 'password_changed', 'organization_profile_updated', 'company_invited',
        'admin_bootstrapped', 'password_reset_issued', 'email_changed', 'account_status_changed',
    ];

    public function up(): void
    {
        foreach (self::OPTIONAL as $column) {
            DB::statement("ALTER TABLE institutions ALTER COLUMN {$column} DROP NOT NULL");
        }
        $notBlank = implode(' AND ', array_map(fn (string $column): string => "({$column} IS NULL OR btrim({$column}) <> '')", self::TEXT));
        DB::statement("ALTER TABLE institutions ADD CONSTRAINT institutions_text_not_blank CHECK ({$notBlank})");

        DB::statement('ALTER TABLE institutions ADD COLUMN onboarding_dismissed_at timestamptz');
        DB::statement('UPDATE institutions SET onboarding_dismissed_at = now()');

        $this->events([...self::EVENTS, 'institution_invited']);
    }

    public function down(): void
    {
        $this->events(self::EVENTS);
        DB::statement('ALTER TABLE institutions DROP COLUMN onboarding_dismissed_at');
        DB::statement('ALTER TABLE institutions DROP CONSTRAINT institutions_text_not_blank');
        foreach (self::OPTIONAL as $column) {
            DB::statement("ALTER TABLE institutions ALTER COLUMN {$column} SET NOT NULL");
        }
    }

    /** @param  list<string>  $events */
    private function events(array $events): void
    {
        $list = implode(', ', array_map(fn (string $event): string => "'{$event}'", $events));
        DB::statement('ALTER TABLE account_audit_events DROP CONSTRAINT account_audit_events_event_check');
        DB::statement("ALTER TABLE account_audit_events ADD CONSTRAINT account_audit_events_event_check CHECK (event IN ({$list}))");
    }
};
