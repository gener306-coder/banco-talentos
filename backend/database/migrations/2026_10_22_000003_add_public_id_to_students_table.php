<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Identificador público del alumno para las empresas (HU-S4-05 CA-08): UUID v4 aleatorio, para que no puedan
     * enumerar alumnos ni deducir su orden de alta. students.id nunca sale en las respuestas para empresas.
     * gen_random_uuid() es parte de PostgreSQL desde la versión 13; los alumnos existentes reciben uno al migrar.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE students ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid()');
        DB::statement('ALTER TABLE students ADD CONSTRAINT students_public_id_unique UNIQUE (public_id)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE students DROP COLUMN IF EXISTS public_id');
    }
};
