<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Teléfono opcional de la institución (T-S8-11).
        Schema::table('institutions', function (Blueprint $table): void {
            $table->string('contact_phone', 20)->nullable()->after('contact_email');
        });
    }

    public function down(): void
    {
        Schema::table('institutions', function (Blueprint $table): void {
            $table->dropColumn('contact_phone');
        });
    }
};
