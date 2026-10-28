<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** HU-S5-05 CA-03: la empresa puede cancelar una solicitud pendiente; queda CANCELADA, sin borrarse. */
    public function up(): void
    {
        DB::statement('ALTER TABLE linkage_requests DROP CONSTRAINT linkage_requests_status_check');
        DB::statement("ALTER TABLE linkage_requests ADD CONSTRAINT linkage_requests_status_check
            CHECK (status IN ('PENDIENTE_INSTITUCION', 'ACEPTADA', 'RECHAZADA', 'CANCELADA'))");
        // Avisos del perfil (CA-04): solicitudes de la empresa para un alumno.
        DB::statement('CREATE INDEX linkage_requests_company_student_index ON linkage_requests (company_id, student_id)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS linkage_requests_company_student_index');
        DB::statement('ALTER TABLE linkage_requests DROP CONSTRAINT linkage_requests_status_check');
        DB::statement("ALTER TABLE linkage_requests ADD CONSTRAINT linkage_requests_status_check
            CHECK (status IN ('PENDIENTE_INSTITUCION', 'ACEPTADA', 'RECHAZADA'))");
    }
};
