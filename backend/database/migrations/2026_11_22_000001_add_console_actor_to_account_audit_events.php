<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * HU-S16-01 y HU-S16-04 (D3, D8): la bitácora acepta acciones de la consola del servidor, que no tienen una cuenta
 * como actor, y registra los eventos nuevos del Sprint 16. Un evento de la interfaz siempre tiene actor; uno de la
 * consola nunca lo tiene.
 */
return new class extends Migration
{
    private const EVENTS = [
        'account_updated', 'password_changed', 'organization_profile_updated', 'company_invited',
        // Sprint 16
        'admin_bootstrapped', 'password_reset_issued', 'email_changed', 'account_status_changed',
    ];

    private const PREVIOUS_EVENTS = ['account_updated', 'password_changed', 'organization_profile_updated', 'company_invited'];

    public function up(): void
    {
        DB::statement('ALTER TABLE account_audit_events ALTER COLUMN actor_id DROP NOT NULL');
        DB::statement("ALTER TABLE account_audit_events ADD COLUMN actor_kind varchar(10) NOT NULL DEFAULT 'user'");
        DB::statement("ALTER TABLE account_audit_events ADD CONSTRAINT account_audit_events_actor_check CHECK (
            (actor_kind = 'user' AND actor_id IS NOT NULL) OR (actor_kind = 'cli' AND actor_id IS NULL))");
        $this->events(self::EVENTS);
    }

    public function down(): void
    {
        // Los eventos de consola no caben en el esquema anterior: no hay vuelta atrás sin perder bitácora.
        $this->events(self::PREVIOUS_EVENTS);
        DB::statement('ALTER TABLE account_audit_events DROP CONSTRAINT account_audit_events_actor_check');
        DB::statement('ALTER TABLE account_audit_events DROP COLUMN actor_kind');
        DB::statement('ALTER TABLE account_audit_events ALTER COLUMN actor_id SET NOT NULL');
    }

    /** @param  list<string>  $events */
    private function events(array $events): void
    {
        $list = implode(', ', array_map(fn (string $event): string => "'{$event}'", $events));
        DB::statement('ALTER TABLE account_audit_events DROP CONSTRAINT account_audit_events_event_check');
        DB::statement("ALTER TABLE account_audit_events ADD CONSTRAINT account_audit_events_event_check CHECK (event IN ({$list}))");
    }
};
