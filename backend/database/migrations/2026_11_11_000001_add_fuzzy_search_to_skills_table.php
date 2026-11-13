<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * T-S10-01: búsqueda de habilidades tolerante a errores, toda en PostgreSQL.
     * - `aliases`: abreviaturas con las que también se encuentra una habilidad («js», «c sharp»), ya normalizadas.
     * - pg_trgm con GiST y no GIN: solo GiST resuelve el orden por distancia (`q <<-> slug`) con el índice (KNN).
     * - fuzzystrmatch: `levenshtein` para las inversiones de letras que los trigramas no alcanzan («pyhton»).
     * El B-tree `skills_slug_prefix_index` se conserva: atiende el prefijo y las búsquedas de 1–2 caracteres.
     * Ambas extensiones son de confianza en RDS: las crea el dueño de la base, sin superusuario.
     */
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE EXTENSION IF NOT EXISTS fuzzystrmatch');
        DB::statement("ALTER TABLE skills ADD COLUMN aliases jsonb NOT NULL DEFAULT '[]'");
        DB::statement("ALTER TABLE skills ADD CONSTRAINT skills_aliases_check CHECK (jsonb_typeof(aliases) = 'array')");
        DB::statement('CREATE INDEX skills_aliases_gin ON skills USING GIN (aliases jsonb_path_ops)');
        DB::statement('CREATE INDEX skills_slug_trgm_gist ON skills USING GIST (slug gist_trgm_ops)');
    }

    public function down(): void
    {
        // Sin DROP EXTENSION: otra tabla podría usarlas más adelante.
        DB::statement('DROP INDEX IF EXISTS skills_slug_trgm_gist');
        DB::statement('DROP INDEX IF EXISTS skills_aliases_gin');
        DB::statement('ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_aliases_check');
        DB::statement('ALTER TABLE skills DROP COLUMN IF EXISTS aliases');
    }
};
