<?php

use App\Enums\VideoStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Videos promocionales de una institución (HU-S9-01). El original vive en el disco privado (source_path) solo
     * mientras se procesa; el MP4 y el póster quedan en el disco de medios. public_id es lo único que identifica al
     * video fuera de su institución; no se relaciona con ningún alumno.
     */
    public function up(): void
    {
        $statuses = implode(', ', array_map(fn (VideoStatus $status): string => "'{$status->value}'", VideoStatus::cases()));

        DB::statement(<<<SQL
            CREATE TABLE institution_videos (
                id bigserial PRIMARY KEY,
                public_id uuid NOT NULL DEFAULT gen_random_uuid(),
                institution_id bigint NOT NULL REFERENCES institutions (id) ON DELETE RESTRICT,
                created_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                title varchar(120) NOT NULL,
                description varchar(1000),
                status varchar(20) NOT NULL DEFAULT 'PROCESSING',
                source_path varchar(255),
                video_path varchar(255),
                poster_path varchar(255),
                duration_seconds integer,
                width smallint,
                height smallint,
                original_bytes bigint NOT NULL,
                output_bytes bigint,
                failure_reason varchar(255),
                is_active boolean NOT NULL DEFAULT true,
                consent_confirmed_at timestamp(0) without time zone NOT NULL,
                created_at timestamp(0) without time zone,
                updated_at timestamp(0) without time zone,
                CONSTRAINT institution_videos_public_id_unique UNIQUE (public_id),
                CONSTRAINT institution_videos_status_check CHECK (status IN ({$statuses})),
                CONSTRAINT institution_videos_original_bytes_check CHECK (original_bytes > 0),
                -- Un video listo siempre tiene sus archivos y sus medidas; uno fallido, su motivo.
                CONSTRAINT institution_videos_ready_check CHECK (status <> 'READY' OR (video_path IS NOT NULL
                    AND poster_path IS NOT NULL AND duration_seconds > 0 AND width > 0 AND height > 0 AND output_bytes > 0)),
                CONSTRAINT institution_videos_failed_check CHECK (status <> 'FAILED' OR failure_reason IS NOT NULL)
            )
            SQL);
        // Listado de la institución (HU-S9-02) y cuota de activos (CA-03), del más reciente al más antiguo.
        DB::statement('CREATE INDEX institution_videos_institution_recent_index ON institution_videos (institution_id, created_at DESC, id DESC)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS institution_videos');
    }
};
