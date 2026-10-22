<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * T-01 (Sprint 4): la extensión la crea una migración, no solo el script de inicialización de Docker,
     * para que una base administrada (RDS) quede lista con `php artisan migrate`. Va antes de cualquier
     * columna espacial y es idempotente en volúmenes que ya la tienen.
     */
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS postgis');
    }

    public function down(): void
    {
        // Sin DROP EXTENSION: las columnas geography dependen de ella y borrarla destruiría datos.
    }
};
