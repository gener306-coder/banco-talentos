<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * CV normalizado (HU-S3-01). Tablas relacionales para lo que las empresas filtrarán (CA-03), con índices que
 * empiezan por la columna filtrada; los enlaces y las credenciales viven aparte, como datos protegidos (CA-02).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->string('headline', 120)->nullable();
        });

        // Catálogo abierto y compartido: el slug normalizado evita «React» y «react» como dos habilidades.
        Schema::create('skills', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 80);
            $table->string('slug', 80)->unique();
            $table->string('kind', 20);
            $table->timestamps();
        });
        DB::statement("ALTER TABLE skills ADD CONSTRAINT skills_kind_check CHECK (kind IN ('technical', 'soft'))");
        // Autocompletar por prefijo (slug LIKE 'rea%') con un índice B-tree.
        DB::statement('CREATE INDEX skills_slug_prefix_index ON skills (slug text_pattern_ops)');

        Schema::create('student_skills', function (Blueprint $table): void {
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('institution_id');
            $table->foreignId('skill_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('position');
            $table->primary(['student_id', 'skill_id']);
            $table->index(['skill_id', 'student_id']);
            $this->ownedByStudent($table);
        });

        Schema::create('student_languages', function (Blueprint $table): void {
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('institution_id');
            $table->string('language_code', 3);
            $table->unsignedSmallInteger('level');
            $table->unsignedSmallInteger('position');
            $table->primary(['student_id', 'language_code']);
            $table->index(['language_code', 'level', 'student_id']);
            $this->ownedByStudent($table);
        });
        DB::statement("ALTER TABLE student_languages ADD CONSTRAINT student_languages_code_check CHECK (language_code ~ '^[a-z]{2,3}$')");
        DB::statement('ALTER TABLE student_languages ADD CONSTRAINT student_languages_level_check CHECK (level BETWEEN 1 AND 7)');

        Schema::create('student_certifications', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 150);
            $table->string('issuer', 120);
            $table->string('issuer_slug', 120);
            $table->date('issued_on');
            $table->date('expires_on')->nullable();
            // Revisión de la institución (CA-04): el actor de confianza da fe de la certificación.
            $table->timestampTz('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedSmallInteger('position');
            $table->timestamps();
            $table->index(['issuer_slug', 'student_id']);
            $table->index('student_id');
            // Destino de la FK de las credenciales: fija el alumno y la institución de la certificación.
            $table->unique(['id', 'student_id', 'institution_id']);
            $this->ownedByStudent($table);
        });
        DB::statement('ALTER TABLE student_certifications ADD CONSTRAINT student_certifications_dates_check CHECK (expires_on IS NULL OR expires_on >= issued_on)');
        DB::statement('ALTER TABLE student_certifications ADD CONSTRAINT student_certifications_verification_check CHECK (verified_at IS NOT NULL OR verified_by IS NULL)');

        Schema::create('student_projects', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('institution_id');
            $table->string('title', 120);
            $table->string('description', 1000);
            $table->string('role', 80)->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->unsignedSmallInteger('position');
            $table->timestamps();
            $table->index('student_id');
            $this->ownedByStudent($table);
        });

        // Datos protegidos (CA-02): revelan la identidad; las empresas no los verán hasta un match.
        Schema::create('student_links', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('institution_id');
            $table->string('kind', 20);
            $table->string('url', 2048);
            $table->unsignedSmallInteger('position');
            $table->timestamps();
            $table->index('student_id');
            $this->ownedByStudent($table);
        });
        DB::statement('CREATE UNIQUE INDEX student_links_student_url_unique ON student_links (student_id, lower(url))');
        DB::statement("ALTER TABLE student_links ADD CONSTRAINT student_links_kind_check CHECK (kind IN ('github', 'linkedin', 'behance', 'portfolio', 'other'))");

        // Credencial de una certificación (CA-04): la página de verificación muestra el nombre del alumno.
        Schema::create('student_certification_credentials', function (Blueprint $table): void {
            $table->unsignedBigInteger('certification_id')->primary();
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('institution_id');
            $table->string('credential_id', 120)->nullable();
            $table->string('credential_url', 2048)->nullable();
            $table->boolean('verifiable')->default(false);
            $table->timestamps();
            // Borrar la certificación borra su credencial; la credencial no puede cambiar de alumno.
            $table->foreign(['certification_id', 'student_id', 'institution_id'])
                ->references(['id', 'student_id', 'institution_id'])->on('student_certifications')
                ->cascadeOnDelete();
        });
        DB::statement('ALTER TABLE student_certification_credentials ADD CONSTRAINT student_certification_credentials_present_check CHECK (credential_id IS NOT NULL OR credential_url IS NOT NULL)');

        DB::statement("COMMENT ON TABLE student_links IS 'Datos protegidos del alumno (enlaces externos que revelan su identidad): uso exclusivo de su institución; no exponer a empresas sin un match.'");
        DB::statement("COMMENT ON TABLE student_certification_credentials IS 'Datos protegidos del alumno (credenciales verificables que revelan su identidad): uso exclusivo de su institución; no exponer a empresas sin un match.'");
    }

    public function down(): void
    {
        Schema::dropIfExists('student_certification_credentials');
        Schema::dropIfExists('student_links');
        Schema::dropIfExists('student_projects');
        Schema::dropIfExists('student_certifications');
        Schema::dropIfExists('student_languages');
        Schema::dropIfExists('student_skills');
        Schema::dropIfExists('skills');
        Schema::table('students', function (Blueprint $table): void {
            $table->dropColumn('headline');
        });
    }

    /** El registro no puede pertenecer a otra institución que su alumno. */
    private function ownedByStudent(Blueprint $table): void
    {
        $table->foreign(['student_id', 'institution_id'])
            ->references(['id', 'institution_id'])->on('students')
            ->restrictOnDelete();
    }
};
