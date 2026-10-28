<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Respuesta institucional (HU-S6-02 CA-03): quién respondió, cuándo y con qué nota. La cuenta que respondió solo
     * la ve la institución; la empresa recibe la fecha y la nota.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE linkage_requests
            ADD COLUMN responded_by bigint REFERENCES users (id) ON DELETE RESTRICT,
            ADD COLUMN responded_at timestamptz,
            ADD COLUMN response_message varchar(500)');
        // La cuenta y la fecha van juntas, y la nota solo existe en una solicitud respondida.
        DB::statement('ALTER TABLE linkage_requests ADD CONSTRAINT linkage_requests_response_pair_check
            CHECK ((responded_by IS NULL) = (responded_at IS NULL) AND (response_message IS NULL OR responded_at IS NOT NULL))');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE linkage_requests DROP CONSTRAINT linkage_requests_response_pair_check');
        DB::statement('ALTER TABLE linkage_requests DROP COLUMN response_message, DROP COLUMN responded_at, DROP COLUMN responded_by');
    }
};
