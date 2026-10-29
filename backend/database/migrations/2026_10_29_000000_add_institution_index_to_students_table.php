<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Padrón, inicio y reporte filtran alumnos por institución y estado (HU-S8-01 CA-05). Sin este índice cada consulta
     * recorría la tabla completa (docs/simulacion-carga.md).
     */
    public function up(): void
    {
        DB::statement('CREATE INDEX students_institution_active_index ON students (institution_id, is_active)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS students_institution_active_index');
    }
};
