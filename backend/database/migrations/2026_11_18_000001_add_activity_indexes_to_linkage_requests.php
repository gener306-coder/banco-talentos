<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * T-S13-09: orden por actividad de las bandejas. La expresión es exactamente la de LinkageRequest::ACTIVITY, para
     * que el orden por defecto se pagine con el índice. GREATEST ignora los NULL en PostgreSQL. created_at es `timestamp`
     * sin zona (Laravel lo guarda en UTC) y las otras dos `timestamptz`: la conversión explícita AT TIME ZONE 'UTC' es
     * IMMUTABLE, la implícita no, y un índice de expresión la exige.
     */
    public function up(): void
    {
        DB::statement('CREATE INDEX linkage_requests_company_activity_index
            ON linkage_requests (company_id, (GREATEST(created_at AT TIME ZONE \'UTC\', responded_at, last_message_at)) DESC, id DESC)');
        DB::statement('CREATE INDEX linkage_requests_institution_activity_index
            ON linkage_requests (institution_id, (GREATEST(created_at AT TIME ZONE \'UTC\', responded_at, last_message_at)) DESC, id DESC)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS linkage_requests_institution_activity_index');
        DB::statement('DROP INDEX IF EXISTS linkage_requests_company_activity_index');
    }
};
