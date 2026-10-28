<?php

use App\Enums\LinkageRequestStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Solicitudes de vinculación directas de una empresa a la institución de un alumno (HU-S5-04), sin mediación de
     * la Secretaría. La empresa conoce al alumno solo por su public_id; student_id es interno.
     */
    public function up(): void
    {
        $statuses = implode(', ', array_map(fn (LinkageRequestStatus $status): string => "'{$status->value}'", LinkageRequestStatus::cases()));

        DB::statement(<<<SQL
            CREATE TABLE linkage_requests (
                id bigserial PRIMARY KEY,
                company_id bigint NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
                opportunity_id bigint NOT NULL REFERENCES opportunities (id) ON DELETE RESTRICT,
                student_id bigint NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
                institution_id bigint NOT NULL REFERENCES institutions (id) ON DELETE RESTRICT,
                requested_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                message varchar(500),
                status varchar(30) NOT NULL DEFAULT 'PENDIENTE_INSTITUCION',
                created_at timestamp(0) without time zone,
                updated_at timestamp(0) without time zone,
                CONSTRAINT linkage_requests_status_check CHECK (status IN ({$statuses}))
            )
            SQL);
        // CA-03: una sola solicitud activa por empresa, alumno y oportunidad, también ante envíos simultáneos.
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX linkage_requests_active_unique ON linkage_requests (company_id, student_id, opportunity_id)
                WHERE status IN ('PENDIENTE_INSTITUCION', 'ACEPTADA')
            SQL);
        // Bandeja de la empresa (HU-S5-05) y de la institución (Sprint 6), de la más reciente a la más antigua.
        DB::statement('CREATE INDEX linkage_requests_company_recent_index ON linkage_requests (company_id, created_at DESC, id DESC)');
        DB::statement('CREATE INDEX linkage_requests_institution_recent_index ON linkage_requests (institution_id, created_at DESC, id DESC)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS linkage_requests');
    }
};
