<?php

use App\Support\MunicipalityCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Catálogo INEGI de municipios (HU-S4-04, PostGIS Fase B): clave de 5 dígitos, estado, nombre y el punto
     * de su cabecera. La carga es un upsert del CSV versionado (database/data/inegi), sin pasos manuales.
     */
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE municipalities (
                code char(5) PRIMARY KEY,
                state_code char(2) NOT NULL,
                name varchar(120) NOT NULL,
                location geography(Point, 4326) NOT NULL,
                -- Destino de la FK compuesta de students: el municipio debe pertenecer al estado guardado.
                CONSTRAINT municipalities_state_code_code_unique UNIQUE (state_code, code),
                CONSTRAINT municipalities_code_format CHECK (code ~ '^(0[1-9]|[12][0-9]|3[0-2])[0-9]{3}$'),
                CONSTRAINT municipalities_code_in_state CHECK (left(code, 2) = state_code)
            )
            SQL);
        DB::statement("COMMENT ON TABLE municipalities IS 'Catálogo INEGI de municipios (Catálogo Único de Claves AGEEML); fuente y edición en database/data/inegi/README.md.'");

        MunicipalityCatalog::sync();
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS municipalities');
    }
};
