<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Último aviso por correo de mensajes sin leer, por lado (HU-S13-05): como máximo uno cada 6 horas mientras la
     * conversación siga sin leer. Al leer, el lado vuelve a quedar en null y el siguiente mensaje avisa de nuevo.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE linkage_requests
            ADD COLUMN company_notified_at timestamptz,
            ADD COLUMN institution_notified_at timestamptz');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE linkage_requests DROP COLUMN institution_notified_at, DROP COLUMN company_notified_at');
    }
};
