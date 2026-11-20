<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * T-S14-13: una vinculación aceptada puede darse de baja (estado BAJA) por la institución o por la empresa, con un
 * motivo. La baja libera el lugar de la oportunidad, que solo cuenta las ACEPTADAS. Se guarda qué lado y qué cuenta la
 * registraron y cuándo; los datos de la baja están completos o ausentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE linkage_requests DROP CONSTRAINT linkage_requests_status_check');
        DB::statement("ALTER TABLE linkage_requests ADD CONSTRAINT linkage_requests_status_check
            CHECK (status IN ('PENDIENTE_INSTITUCION', 'ACEPTADA', 'RECHAZADA', 'CANCELADA', 'BAJA'))");
        DB::statement('ALTER TABLE linkage_requests
            ADD COLUMN terminated_at timestamptz NULL,
            ADD COLUMN terminated_by bigint NULL REFERENCES users(id) ON DELETE RESTRICT,
            ADD COLUMN terminated_party varchar(20) NULL,
            ADD COLUMN termination_reason text NULL');
        DB::statement("ALTER TABLE linkage_requests ADD CONSTRAINT linkage_requests_termination_check CHECK (
            (status = 'BAJA') = (terminated_at IS NOT NULL)
            AND (terminated_at IS NULL) = (terminated_by IS NULL)
            AND (terminated_at IS NULL) = (terminated_party IS NULL)
            AND (terminated_at IS NULL) = (termination_reason IS NULL)
            AND (terminated_party IS NULL OR terminated_party IN ('COMPANY', 'INSTITUTION'))
            AND (termination_reason IS NULL OR btrim(termination_reason) <> ''))");
    }

    public function down(): void
    {
        DB::statement("UPDATE linkage_requests SET status = 'ACEPTADA' WHERE status = 'BAJA'");
        DB::statement('ALTER TABLE linkage_requests DROP CONSTRAINT linkage_requests_termination_check');
        DB::statement('ALTER TABLE linkage_requests DROP COLUMN terminated_at, DROP COLUMN terminated_by, DROP COLUMN terminated_party, DROP COLUMN termination_reason');
        DB::statement('ALTER TABLE linkage_requests DROP CONSTRAINT linkage_requests_status_check');
        DB::statement("ALTER TABLE linkage_requests ADD CONSTRAINT linkage_requests_status_check
            CHECK (status IN ('PENDIENTE_INSTITUCION', 'ACEPTADA', 'RECHAZADA', 'CANCELADA'))");
    }
};
