<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Punto aproximado del alumno para las futuras búsquedas por radio de las empresas.
        // geography: ST_DWithin mide en metros. Lo calcula el servidor a partir del estado; nunca lo envía el cliente.
        DB::statement('ALTER TABLE students ADD COLUMN location geography(Point, 4326)');
        DB::statement('CREATE INDEX students_location_gist ON students USING GIST (location)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS students_location_gist');
        DB::statement('ALTER TABLE students DROP COLUMN IF EXISTS location');
    }
};
