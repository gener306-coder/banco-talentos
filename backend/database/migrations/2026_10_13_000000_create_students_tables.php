<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Expediente público del alumno (HU-S2-02). HU-S2-03 y HU-S2-04 le añaden columnas.
        Schema::create('students', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('institution_id')->constrained()->restrictOnDelete();
            $table->timestamps();
            // Destino de la FK compuesta de la identidad: fija la institución del alumno.
            $table->unique(['id', 'institution_id']);
        });

        // Identidad protegida (HU-S2-02 CA-05): uso exclusivo de la institución; nunca se expone a empresas.
        Schema::create('student_identities', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('student_id')->unique();
            $table->unsignedBigInteger('institution_id');
            $table->string('enrollment_number', 30);
            $table->string('given_names', 120);
            $table->string('first_surname', 120);
            $table->string('second_surname', 120)->nullable();
            $table->timestamps();
            // La identidad no puede pertenecer a otra institución que su alumno.
            $table->foreign(['student_id', 'institution_id'])
                ->references(['id', 'institution_id'])->on('students')
                ->restrictOnDelete();
        });

        // Matrícula única por institución sin distinguir mayúsculas (HU-S2-02 CA-06).
        DB::statement('CREATE UNIQUE INDEX student_identities_institution_enrollment_unique ON student_identities (institution_id, lower(enrollment_number))');
        DB::statement("COMMENT ON TABLE student_identities IS 'Datos protegidos del alumno (matrícula y nombre): uso exclusivo de su institución; no exponer a empresas.'");
    }

    public function down(): void
    {
        Schema::dropIfExists('student_identities');
        Schema::dropIfExists('students');
    }
};
