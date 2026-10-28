<?php

use App\Enums\AcademicPeriodType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Oportunidades de Educación Dual de una empresa (HU-S5-02). Sin DELETE: la baja lógica (is_active) pertenece a
     * HU-S5-03. Las habilidades reutilizan el catálogo compartido de HU-S3-01.
     */
    public function up(): void
    {
        $periodTypes = implode(', ', array_map(fn (AcademicPeriodType $type): string => "'{$type->value}'", AcademicPeriodType::cases()));

        DB::statement(<<<SQL
            CREATE TABLE opportunities (
                id bigserial PRIMARY KEY,
                company_id bigint NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
                title varchar(150) NOT NULL,
                program varchar(150) NOT NULL,
                period_type varchar(20) NOT NULL,
                period_number smallint NOT NULL,
                vacancies smallint NOT NULL,
                can_relocate boolean NOT NULL,
                state_code char(2) NOT NULL,
                municipality_code char(5) NOT NULL,
                -- Cabecera del municipio, derivada por el servidor (CA-05); nunca la envía el cliente.
                location geography(Point, 4326) NOT NULL,
                description varchar(1500) NOT NULL,
                language_code varchar(3),
                min_level smallint,
                is_active boolean NOT NULL DEFAULT true,
                created_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                created_at timestamp(0) without time zone,
                updated_at timestamp(0) without time zone,
                CONSTRAINT opportunities_period_type_check CHECK (period_type IN ({$periodTypes})),
                CONSTRAINT opportunities_period_number_check CHECK (period_number BETWEEN 1 AND 15),
                CONSTRAINT opportunities_vacancies_check CHECK (vacancies BETWEEN 1 AND 50),
                CONSTRAINT opportunities_language_code_check CHECK (language_code ~ '^[a-z]{2,3}$'),
                CONSTRAINT opportunities_min_level_check CHECK (min_level BETWEEN 1 AND 7),
                -- Idioma y nivel mínimo van juntos o ninguno (CA-03).
                CONSTRAINT opportunities_language_pair_check CHECK ((language_code IS NULL) = (min_level IS NULL)),
                -- El municipio debe pertenecer al estado guardado (catálogo INEGI, HU-S4-04).
                CONSTRAINT opportunities_municipality_foreign FOREIGN KEY (state_code, municipality_code)
                    REFERENCES municipalities (state_code, code) ON DELETE RESTRICT
            )
            SQL);
        // Listado de la empresa, de la más reciente a la más antigua (CA-06).
        DB::statement('CREATE INDEX opportunities_company_recent_index ON opportunities (company_id, created_at DESC, id DESC)');
        DB::statement('CREATE INDEX opportunities_location_gist ON opportunities USING GIST (location)');

        DB::statement(<<<'SQL'
            CREATE TABLE opportunity_skills (
                opportunity_id bigint NOT NULL REFERENCES opportunities (id) ON DELETE RESTRICT,
                skill_id bigint NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
                position smallint NOT NULL,
                PRIMARY KEY (opportunity_id, skill_id)
            )
            SQL);
        DB::statement('CREATE INDEX opportunity_skills_skill_index ON opportunity_skills (skill_id, opportunity_id)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS opportunity_skills');
        DB::statement('DROP TABLE IF EXISTS opportunities');
    }
};
