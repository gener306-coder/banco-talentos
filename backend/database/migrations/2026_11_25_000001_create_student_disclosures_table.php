<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * T-S19-05: ficha que la institución comparte con la empresa tras aceptar la vinculación (D1 a D4).
 *
 * Cada vez que se comparte se crea un registro con los grupos de la lista blanca (StudentDisclosure::SHAREABLE) y el
 * consentimiento; dejar de compartir solo fija revoked_*, una vez. Volver a compartir crea otro registro, así que la tabla
 * es también la historia de la bitácora. No guarda los datos del alumno: la empresa los lee en vivo mientras siga vigente.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE student_disclosures (
                id bigserial PRIMARY KEY,
                linkage_request_id bigint NOT NULL REFERENCES linkage_requests (id) ON DELETE RESTRICT,
                institution_id bigint NOT NULL REFERENCES institutions (id) ON DELETE RESTRICT,
                company_id bigint NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
                student_id bigint NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
                fields jsonb NOT NULL,
                consent_confirmed_at timestamptz NOT NULL,
                disclosed_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                disclosed_at timestamptz NOT NULL,
                revoked_by bigint NULL REFERENCES users (id) ON DELETE RESTRICT,
                revoked_at timestamptz NULL,
                revoked_reason varchar(20) NULL,
                CONSTRAINT student_disclosures_fields_check CHECK (
                    jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) > 0
                    AND fields <@ '["full_name", "links", "credentials"]'::jsonb),
                CONSTRAINT student_disclosures_revocation_check CHECK (
                    (revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoked_reason IS NULL)
                    AND (revoked_reason IS NULL OR revoked_reason IN ('institution', 'termination')))
            )
            SQL);
        // Una sola ficha vigente por vinculación.
        DB::statement('CREATE UNIQUE INDEX student_disclosures_active_unique ON student_disclosures (linkage_request_id) WHERE revoked_at IS NULL');
        DB::statement('CREATE INDEX student_disclosures_disclosed_index ON student_disclosures (disclosed_at DESC, id DESC)');
        DB::statement('CREATE INDEX student_disclosures_revoked_index ON student_disclosures (revoked_at DESC, id DESC) WHERE revoked_at IS NOT NULL');

        // Solo se permite fijar la revocación una vez; lo demás no se edita ni se borra.
        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION student_disclosures_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF TG_OP = 'DELETE' OR OLD.revoked_at IS NOT NULL
                    OR (to_jsonb(NEW) - 'revoked_by' - 'revoked_at' - 'revoked_reason') <> (to_jsonb(OLD) - 'revoked_by' - 'revoked_at' - 'revoked_reason') THEN
                    RAISE EXCEPTION 'Una ficha compartida solo admite dejar de compartirse, una vez.';
                END IF;
                RETURN NEW;
            END;
            $$
            SQL);
        DB::statement('CREATE TRIGGER student_disclosures_append_only BEFORE UPDATE OR DELETE ON student_disclosures
            FOR EACH ROW EXECUTE FUNCTION student_disclosures_append_only()');
        // T-S19-08: los datos protegidos que la ficha puede compartir lo dicen en su comentario.
        DB::statement("COMMENT ON TABLE student_identities IS 'Datos protegidos del alumno (matrícula y nombre): uso exclusivo de su institución. Solo el nombre puede compartirse con la empresa de una vinculación aceptada, por la ficha compartida (student_disclosures); la matrícula nunca.'");
        DB::statement("COMMENT ON TABLE student_links IS 'Datos protegidos del alumno (enlaces externos que revelan su identidad): uso exclusivo de su institución; solo se comparten con la empresa de una vinculación aceptada por la ficha compartida (student_disclosures).'");
        DB::statement("COMMENT ON TABLE student_certification_credentials IS 'Datos protegidos del alumno (credenciales verificables que revelan su identidad): uso exclusivo de su institución; solo se comparten con la empresa de una vinculación aceptada por la ficha compartida (student_disclosures).'");
        DB::statement("COMMENT ON TABLE student_disclosures IS 'Ficha compartida con la empresa (Sprint 19, D1): grupos de la lista blanca y consentimiento, por decisión revocable de la institución. No copia datos del alumno.'");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE student_disclosures');
        DB::statement('DROP FUNCTION IF EXISTS student_disclosures_append_only()');
        DB::statement("COMMENT ON TABLE student_identities IS 'Datos protegidos del alumno (matrícula y nombre): uso exclusivo de su institución; no exponer a empresas.'");
        DB::statement("COMMENT ON TABLE student_links IS 'Datos protegidos del alumno (enlaces externos que revelan su identidad): uso exclusivo de su institución; no exponer a empresas sin un match.'");
        DB::statement("COMMENT ON TABLE student_certification_credentials IS 'Datos protegidos del alumno (credenciales verificables que revelan su identidad): uso exclusivo de su institución; no exponer a empresas sin un match.'");
    }
};
