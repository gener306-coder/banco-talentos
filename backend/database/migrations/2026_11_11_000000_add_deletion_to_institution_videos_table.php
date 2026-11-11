<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Eliminación de videos (T-S9-04): borra el MP4 y el póster para liberar espacio y conserva un registro mínimo
     * oculto (título, consentimiento, autoría y quién lo eliminó). No hay ruta DELETE.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE institution_videos ADD COLUMN deleted_at timestamptz NULL, ADD COLUMN deleted_by bigint NULL REFERENCES users(id)');
        // Un video listo conserva sus archivos mientras no se elimine; uno eliminado ya no tiene archivos ni está activo.
        DB::statement('ALTER TABLE institution_videos DROP CONSTRAINT institution_videos_ready_check');
        DB::statement("ALTER TABLE institution_videos ADD CONSTRAINT institution_videos_ready_check CHECK (status <> 'READY' OR deleted_at IS NOT NULL
            OR (video_path IS NOT NULL AND poster_path IS NOT NULL AND duration_seconds > 0 AND width > 0 AND height > 0 AND output_bytes > 0))");
        DB::statement('ALTER TABLE institution_videos ADD CONSTRAINT institution_videos_deleted_check CHECK (deleted_at IS NULL
            OR (video_path IS NULL AND poster_path IS NULL AND is_active = false AND deleted_by IS NOT NULL))');
    }

    public function down(): void
    {
        DB::statement('DELETE FROM institution_videos WHERE deleted_at IS NOT NULL');
        DB::statement('ALTER TABLE institution_videos DROP CONSTRAINT institution_videos_deleted_check');
        DB::statement('ALTER TABLE institution_videos DROP CONSTRAINT institution_videos_ready_check');
        DB::statement("ALTER TABLE institution_videos ADD CONSTRAINT institution_videos_ready_check CHECK (status <> 'READY' OR (video_path IS NOT NULL
            AND poster_path IS NOT NULL AND duration_seconds > 0 AND width > 0 AND height > 0 AND output_bytes > 0))");
        DB::statement('ALTER TABLE institution_videos DROP COLUMN deleted_by, DROP COLUMN deleted_at');
    }
};
