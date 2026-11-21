<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * T-S14-18: versión WebM (VP9 + Opus) de cada video promocional, además del MP4 H.264. Algunos navegadores no
 * decodifican H.264 (por ejemplo, Firefox de Fedora con ffmpeg-free y sin openh264): el reproductor cambia a esta
 * versión si el MP4 falla. Es opcional: un video sin ella (anterior a la tarea o cuya conversión falló) sigue listo con
 * su MP4.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE institution_videos ADD COLUMN webm_path varchar(255) NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE institution_videos DROP COLUMN webm_path');
    }
};
