<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Puesto o departamento del contacto del programa dual (T-S8-06).
        Schema::table('companies', function (Blueprint $table): void {
            $table->string('contact_position', 120)->nullable()->after('contact_name');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn('contact_position');
        });
    }
};
