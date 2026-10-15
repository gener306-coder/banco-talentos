<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Baja lógica (HU-S2-04): un alumno inactivo se oculta del Banco de Talentos, pero su expediente se conserva.
        // Los alumnos ya registrados quedan activos.
        Schema::table('students', function (Blueprint $table): void {
            $table->boolean('is_active')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->dropColumn('is_active');
        });
    }
};
