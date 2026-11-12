<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** Vocales acentuadas, diéresis, «ñ» y «ç» del español, en mayúsculas y minúsculas, y su letra base. */
    private const ACCENTED = 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ';

    private const PLAIN = 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC';

    /**
     * Texto libre del buscador de talento sobre el titular y la carrera (HU-S11-03).
     *
     * Las columnas *_search guardan el texto en minúsculas y sin acentos. Son columnas generadas: PostgreSQL las
     * mantiene en cada INSERT y UPDATE (también en las cargas masivas) y normaliza las filas existentes al migrar,
     * así que no pueden quedar desfasadas. La misma función normaliza lo que escribe la empresa.
     * translate() va antes de lower() para no depender de la configuración regional de la base.
     */
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement(sprintf(
            "CREATE FUNCTION talent_search_text(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
            AS \$\$ SELECT lower(translate(\$1, '%s', '%s')) \$\$",
            self::ACCENTED, self::PLAIN,
        ));
        DB::statement('ALTER TABLE students
            ADD COLUMN headline_search varchar(120) GENERATED ALWAYS AS (talent_search_text(headline)) STORED,
            ADD COLUMN program_search varchar(150) GENERATED ALWAYS AS (talent_search_text(program)) STORED');
        // GIN de trigramas: sirve al filtro por similitud de palabra (<%) y al texto contenido (LIKE '%…%').
        DB::statement('CREATE INDEX students_headline_search_trgm ON students USING GIN (headline_search gin_trgm_ops)');
        DB::statement('CREATE INDEX students_program_search_trgm ON students USING GIN (program_search gin_trgm_ops)');
    }

    /** No quita pg_trgm: la usa también el catálogo de habilidades (T-S10-01). */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS students_program_search_trgm');
        DB::statement('DROP INDEX IF EXISTS students_headline_search_trgm');
        DB::statement('ALTER TABLE students DROP COLUMN IF EXISTS program_search, DROP COLUMN IF EXISTS headline_search');
        DB::statement('DROP FUNCTION IF EXISTS talent_search_text(text)');
    }
};
