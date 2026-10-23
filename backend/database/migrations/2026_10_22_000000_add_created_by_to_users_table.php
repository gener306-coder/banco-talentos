<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Auditoría de altas (HU-S4-01 CA-06, AGENTS.md: «Toda cuenta registra quién la creó»). Nula para las
     * cuentas anteriores y las creadas con `auth:create-user`, que no tienen un usuario creador.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('created_by')->nullable()->after('institution_id')->constrained('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('created_by');
        });
    }
};
