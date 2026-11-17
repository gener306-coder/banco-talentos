<?php

use App\Enums\LinkageParty;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Hilo de mensajes de una solicitud de vinculación aceptada (HU-S13-01). Siempre escribe una cuenta; el lado
     * (empresa o institución) lo fija el servidor según la sesión. Los mensajes son el registro de lo acordado: la
     * base de datos impide editarlos o borrarlos. El marcador de lectura es por lado, en la propia solicitud.
     */
    public function up(): void
    {
        $parties = implode(', ', array_map(fn (LinkageParty $party): string => "'{$party->value}'", LinkageParty::cases()));
        DB::statement(<<<SQL
            CREATE TABLE linkage_messages (
                id bigserial PRIMARY KEY,
                linkage_request_id bigint NOT NULL REFERENCES linkage_requests (id) ON DELETE RESTRICT,
                sender_party varchar(20) NOT NULL,
                sender_user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                body varchar(2000) NOT NULL,
                created_at timestamptz NOT NULL,
                CONSTRAINT linkage_messages_sender_party_check CHECK (sender_party IN ({$parties})),
                CONSTRAINT linkage_messages_body_check CHECK (length(btrim(body)) > 0)
            )
            SQL);
        // Hilo en orden cronológico y consulta incremental con after=<id>.
        DB::statement('CREATE INDEX linkage_messages_thread_index ON linkage_messages (linkage_request_id, id)');

        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION linkage_messages_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Los mensajes de vinculación no se editan ni se borran.';
            END;
            $$
            SQL);
        DB::statement('CREATE TRIGGER linkage_messages_immutable BEFORE UPDATE OR DELETE ON linkage_messages
            FOR EACH ROW EXECUTE FUNCTION linkage_messages_immutable()');

        DB::statement('ALTER TABLE linkage_requests
            ADD COLUMN last_message_at timestamptz,
            ADD COLUMN company_last_read_message_id bigint REFERENCES linkage_messages (id) ON DELETE RESTRICT,
            ADD COLUMN institution_last_read_message_id bigint REFERENCES linkage_messages (id) ON DELETE RESTRICT');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE linkage_requests
            DROP COLUMN institution_last_read_message_id,
            DROP COLUMN company_last_read_message_id,
            DROP COLUMN last_message_at');
        DB::statement('DROP TABLE IF EXISTS linkage_messages');
        DB::statement('DROP FUNCTION IF EXISTS linkage_messages_immutable()');
    }
};
