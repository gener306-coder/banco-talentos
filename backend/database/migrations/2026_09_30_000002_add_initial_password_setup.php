<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Las cuentas existentes conservan sus credenciales y su acceso.
            $table->boolean('password_setup_required')->default(false);
        });

        Schema::create('institution_password_setup_tokens', function (Blueprint $table): void {
            $table->string('email', 254)->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_password_setup_tokens');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('password_setup_required'));
    }
};
