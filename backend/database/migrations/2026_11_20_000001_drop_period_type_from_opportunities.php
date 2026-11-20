<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * T-S14-10: el periodo mínimo de una oportunidad es solo un número, leído contra el periodo del alumno sea semestre o
 * cuatrimestre (como el filtro del buscador). El tipo nunca se validaba y sugería excluir al plan cuatrimestral. Su
 * CHECK cae con la columna. El periodo del alumno (students.period_type) no cambia.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE opportunities DROP COLUMN period_type');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE opportunities ADD COLUMN period_type varchar(20) NULL');
        DB::statement("ALTER TABLE opportunities ADD CONSTRAINT opportunities_period_type_check CHECK (period_type IS NULL OR period_type IN ('semester', 'four_month'))");
    }
};
