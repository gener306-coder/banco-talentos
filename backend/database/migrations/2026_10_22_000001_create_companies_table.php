<?php

use App\Enums\EconomicSector;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Empresas validadas por la Secretaría de Economía (HU-S4-02). Alta mínima: identificación, sector, municipio
     * (origen de la búsqueda por radio) y contacto del programa dual; sin domicilio ni documentos.
     */
    public function up(): void
    {
        $sectors = implode(', ', array_map(fn (string $code): string => "'{$code}'", EconomicSector::values()));

        DB::statement(<<<SQL
            CREATE TABLE companies (
                id bigserial PRIMARY KEY,
                legal_name varchar(200) NOT NULL,
                trade_name varchar(150),
                rfc varchar(13) NOT NULL,
                sector_code varchar(5) NOT NULL,
                state_code char(2) NOT NULL,
                municipality_code char(5) NOT NULL,
                -- Cabecera del municipio, derivada por el servidor (CA-05); nunca la envía el cliente.
                location geography(Point, 4326) NOT NULL,
                contact_name varchar(120) NOT NULL,
                contact_email varchar(254) NOT NULL,
                contact_phone varchar(20),
                validation_reference varchar(60),
                is_active boolean NOT NULL DEFAULT true,
                registered_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                created_at timestamp(0) without time zone,
                updated_at timestamp(0) without time zone,
                -- Único aun entre empresas inactivas (CA-03).
                CONSTRAINT companies_rfc_unique UNIQUE (rfc),
                CONSTRAINT companies_rfc_format CHECK (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
                CONSTRAINT companies_sector_code_check CHECK (sector_code IN ({$sectors})),
                -- El municipio debe pertenecer al estado guardado (catálogo INEGI, HU-S4-04).
                CONSTRAINT companies_municipality_foreign FOREIGN KEY (state_code, municipality_code)
                    REFERENCES municipalities (state_code, code) ON DELETE RESTRICT
            )
            SQL);
        DB::statement('CREATE INDEX companies_legal_name_index ON companies (lower(legal_name))');
        DB::statement('CREATE INDEX companies_location_gist ON companies USING GIST (location)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS companies');
    }
};
