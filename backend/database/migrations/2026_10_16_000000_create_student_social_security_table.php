<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Seguro facultativo (HU-S3-02): resguardo exclusivo de la institución; nunca se expone a empresas.
        Schema::create('student_social_security', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('student_id')->unique();
            $table->unsignedBigInteger('institution_id');
            // NSS cifrado por la aplicación (cast encrypted) y su índice ciego HMAC-SHA256 para la unicidad.
            $table->text('nss')->nullable();
            $table->char('nss_hash', 64)->nullable();
            // Comprobante en el disco local privado; la ruta nunca sale del servidor.
            $table->string('document_path')->nullable();
            $table->string('document_name')->nullable();
            $table->unsignedInteger('document_size')->nullable();
            $table->char('document_sha256', 64)->nullable();
            $table->timestampTz('document_uploaded_at')->nullable();
            $table->timestamps();
            // El seguro no puede pertenecer a otra institución que su alumno.
            $table->foreign(['student_id', 'institution_id'])
                ->references(['id', 'institution_id'])->on('students')
                ->restrictOnDelete();
            // Un NSS no se repite dentro de la institución; PostgreSQL ignora los nulos.
            $table->unique(['institution_id', 'nss_hash'], 'student_social_security_institution_nss_unique');
        });

        DB::statement('ALTER TABLE student_social_security ADD CONSTRAINT student_social_security_nss_pair_check CHECK ((nss IS NULL) = (nss_hash IS NULL))');
        DB::statement("ALTER TABLE student_social_security ADD CONSTRAINT student_social_security_nss_hash_check CHECK (nss_hash ~ '^[0-9a-f]{64}$')");
        DB::statement('ALTER TABLE student_social_security ADD CONSTRAINT student_social_security_document_check CHECK ((document_path IS NULL) = (document_sha256 IS NULL))');
        DB::statement("COMMENT ON TABLE student_social_security IS 'Datos protegidos del alumno (NSS cifrado y comprobante del IMSS): uso exclusivo de su institución; no exponer a empresas.'");
    }

    public function down(): void
    {
        Schema::dropIfExists('student_social_security');
    }
};
