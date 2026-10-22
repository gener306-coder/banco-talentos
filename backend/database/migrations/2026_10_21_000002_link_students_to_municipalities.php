<?php

use App\Support\CatalogSlug;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * El expediente guarda el municipio por su clave INEGI (HU-S4-04 CA-05). El texto libre anterior pasa a
     * legacy_municipality: se asigna la clave cuando su nombre normalizado coincide con un municipio del mismo
     * estado; si no coincide, el alumno conserva el punto de su estado y queda «por confirmar» (CA-06).
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE students RENAME COLUMN municipality TO legacy_municipality');
        DB::statement('ALTER TABLE students ADD COLUMN municipality_code char(5)');
        // MATCH SIMPLE: sin municipio (o sin estado) no se comprueba; con ambos, el municipio es de ese estado.
        DB::statement('ALTER TABLE students ADD CONSTRAINT students_municipality_foreign
            FOREIGN KEY (state_code, municipality_code) REFERENCES municipalities (state_code, code) ON DELETE RESTRICT');
        DB::statement('CREATE INDEX students_municipality_code_index ON students (municipality_code)');
        DB::statement("COMMENT ON COLUMN students.legacy_municipality IS 'Municipio capturado como texto libre antes del catálogo INEGI; pendiente de confirmar. Se eliminará cuando no queden pendientes.'");

        $this->matchLegacyMunicipalities();
    }

    public function down(): void
    {
        DB::statement('UPDATE students s SET legacy_municipality = m.name FROM municipalities m
            WHERE s.municipality_code = m.code AND s.legacy_municipality IS NULL');
        DB::statement('ALTER TABLE students DROP CONSTRAINT IF EXISTS students_municipality_foreign');
        DB::statement('DROP INDEX IF EXISTS students_municipality_code_index');
        DB::statement('ALTER TABLE students DROP COLUMN IF EXISTS municipality_code');
        DB::statement('ALTER TABLE students RENAME COLUMN legacy_municipality TO municipality');
    }

    private function matchLegacyMunicipalities(): void
    {
        // Nombre normalizado → clave, por estado. Un nombre repetido dentro de un estado no se asigna.
        $catalog = [];
        foreach (DB::table('municipalities')->get(['code', 'state_code', 'name']) as $municipality) {
            $slug = CatalogSlug::from($municipality->name);
            $catalog[$municipality->state_code][$slug] = isset($catalog[$municipality->state_code][$slug]) ? null : $municipality->code;
        }

        $pending = DB::table('students')
            ->whereNotNull('legacy_municipality')
            ->whereNotNull('state_code')
            ->get(['id', 'state_code', 'legacy_municipality']);

        foreach ($pending as $student) {
            $code = $catalog[$student->state_code][CatalogSlug::from($student->legacy_municipality)] ?? null;
            if ($code === null) {
                continue;
            }

            DB::update(
                'UPDATE students SET municipality_code = m.code, legacy_municipality = NULL, location = m.location
                 FROM municipalities m WHERE students.id = ? AND m.code = ?',
                [$student->id, $code],
            );
        }
    }
};
