<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Seguros distintos del IMSS (T-S8-07): lo existente queda como IMSS.
        Schema::table('student_social_security', function (Blueprint $table): void {
            $table->string('insurance_type', 10)->default('IMSS');
            $table->string('insurer_name', 120)->nullable();
            // Número de póliza cifrado por la aplicación; sin índice ciego porque una póliza familiar puede repetirse.
            $table->text('policy_number')->nullable();
        });

        DB::statement("ALTER TABLE student_social_security ADD CONSTRAINT student_social_security_insurance_type_check CHECK (
            (insurance_type = 'IMSS' AND insurer_name IS NULL AND policy_number IS NULL)
            OR (insurance_type = 'OTHER' AND nss IS NULL AND insurer_name IS NOT NULL)
        )");
        DB::statement("COMMENT ON TABLE student_social_security IS 'Datos protegidos del alumno (NSS o póliza cifrados y comprobante del seguro): uso exclusivo de su institución; no exponer a empresas.'");
    }

    public function down(): void
    {
        DB::statement("DELETE FROM student_social_security WHERE insurance_type <> 'IMSS'");
        DB::statement('ALTER TABLE student_social_security DROP CONSTRAINT student_social_security_insurance_type_check');
        Schema::table('student_social_security', function (Blueprint $table): void {
            $table->dropColumn(['insurance_type', 'insurer_name', 'policy_number']);
        });
        DB::statement("COMMENT ON TABLE student_social_security IS 'Datos protegidos del alumno (NSS cifrado y comprobante del IMSS): uso exclusivo de su institución; no exponer a empresas.'");
    }
};
