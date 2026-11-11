<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Persona responsable de la institución y su puesto opcional (T-S8-11). El nombre admite NULL solo porque las
        // instituciones anteriores no lo tienen: la API lo exige al registrar y al editar.
        Schema::table('institutions', function (Blueprint $table): void {
            $table->string('contact_name', 120)->nullable()->after('cct');
            $table->string('contact_position', 120)->nullable()->after('contact_name');
        });
    }

    public function down(): void
    {
        Schema::table('institutions', function (Blueprint $table): void {
            $table->dropColumn(['contact_name', 'contact_position']);
        });
    }
};
