<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Bitácora de cambios de cuentas y organizaciones (Sprint 14). Quién cambió qué y cuándo: solo los nombres de los
     * campos, nunca sus valores (ni datos de contacto ni contraseñas). Es el registro de control de la plataforma: la base
     * de datos impide editar o borrar eventos.
     *
     * Además, `users.remember_token`: se rota al cambiar la contraseña para invalidar sesiones persistentes (HU-S14-01).
     */
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE account_audit_events (
                id bigserial PRIMARY KEY,
                actor_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                event varchar(30) NOT NULL,
                subject_type varchar(20) NOT NULL,
                subject_id bigint NOT NULL,
                changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
                created_at timestamptz NOT NULL,
                CONSTRAINT account_audit_events_event_check
                    CHECK (event IN ('account_updated', 'password_changed', 'profile_updated', 'sector_established')),
                CONSTRAINT account_audit_events_subject_type_check CHECK (subject_type IN ('user', 'company', 'institution')),
                CONSTRAINT account_audit_events_changed_fields_check CHECK (jsonb_typeof(changed_fields) = 'array')
            )
            SQL);
        // Bitácora en orden cronológico inverso y eventos de un mismo recurso.
        DB::statement('CREATE INDEX account_audit_events_recent_index ON account_audit_events (created_at DESC, id DESC)');
        DB::statement('CREATE INDEX account_audit_events_subject_index ON account_audit_events (subject_type, subject_id)');

        // OR REPLACE: migrate:fresh borra las tablas pero no las funciones.
        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION account_audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Los eventos de la bitácora no se editan ni se borran.';
            END;
            $$
            SQL);
        DB::statement('CREATE TRIGGER account_audit_events_immutable BEFORE UPDATE OR DELETE ON account_audit_events
            FOR EACH ROW EXECUTE FUNCTION account_audit_events_immutable()');

        DB::statement('ALTER TABLE users ADD COLUMN remember_token varchar(100)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP COLUMN IF EXISTS remember_token');
        DB::statement('DROP TABLE IF EXISTS account_audit_events');
        DB::statement('DROP FUNCTION IF EXISTS account_audit_events_immutable()');
    }
};
