<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Identificador público de la institución para la galería de promoción dual (HU-S9-03 CA-01): el filtro por
     * institución no usa institutions.id. UUID v4 aleatorio, igual que students.public_id; las existentes reciben uno.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE institutions ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid()');
        DB::statement('ALTER TABLE institutions ADD CONSTRAINT institutions_public_id_unique UNIQUE (public_id)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE institutions DROP COLUMN IF EXISTS public_id');
    }
};
