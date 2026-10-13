<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Expediente público del alumno (HU-S2-03). Nulo significa «sin capturar»: el alta solo pide la identidad.
        Schema::table('students', function (Blueprint $table): void {
            $table->string('program', 150)->nullable();
            $table->string('period_type', 20)->nullable();
            $table->smallInteger('period_number')->nullable();
            // Disponibilidad para el programa dual; no es la visibilidad del perfil (HU-S2-04).
            $table->boolean('dual_available')->nullable();
            // Ubicación aproximada: entidad (clave INEGI) y municipio, nunca una dirección.
            $table->char('state_code', 2)->nullable();
            $table->string('municipality', 120)->nullable();
            $table->boolean('can_relocate')->nullable();
        });

        DB::statement("ALTER TABLE students ADD CONSTRAINT students_period_type_check CHECK (period_type IN ('semester', 'four_month'))");
        DB::statement('ALTER TABLE students ADD CONSTRAINT students_period_number_check CHECK (period_number BETWEEN 1 AND 15)');
        DB::statement('ALTER TABLE students ADD CONSTRAINT students_period_complete_check CHECK ((period_type IS NULL) = (period_number IS NULL))');
        DB::statement("ALTER TABLE students ADD CONSTRAINT students_state_code_check CHECK (state_code ~ '^(0[1-9]|[12][0-9]|3[0-2])$')");
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->dropColumn(['program', 'period_type', 'period_number', 'dual_available', 'state_code', 'municipality', 'can_relocate']);
        });
    }
};
