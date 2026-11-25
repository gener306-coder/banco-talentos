<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Sprint 19: correo de acceso verificado.
 *
 * - email_verified_at (T-S19-01): se fija al completar un enlace enviado por correo o al confirmar el correo con el
 *   enlace de un solo uso (T-S19-03 y T-S19-04). Las cuentas existentes quedan sin verificar (D6: no bloquea el acceso).
 * - setup_delivery (T-S19-01, D7): cómo se entregó el último enlace de contraseña emitido. Cada enlace nuevo invalida el
 *   anterior, así que describe el único vigente; uno manual no prueba el buzón.
 * - pending_email, email_token_hash y email_token_sent_at (T-S19-03 y T-S19-04): correo nuevo por confirmar y el hash del
 *   enlace vigente. Sin pending_email, el enlace verifica el correo actual.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users
            ADD COLUMN email_verified_at timestamptz NULL,
            ADD COLUMN setup_delivery varchar(10) NULL,
            ADD COLUMN pending_email varchar(254) NULL,
            ADD COLUMN email_token_hash char(64) NULL,
            ADD COLUMN email_token_sent_at timestamptz NULL');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_setup_delivery_check CHECK (setup_delivery IN ('email', 'manual'))");
        // El hash y su fecha van juntos, y un correo pendiente siempre tiene su enlace.
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_email_token_check CHECK (
            (email_token_hash IS NULL) = (email_token_sent_at IS NULL)
            AND (pending_email IS NULL OR email_token_hash IS NOT NULL))');
        // La confirmación busca la cuenta por el hash del enlace, sin exponer su id en la URL.
        DB::statement('CREATE UNIQUE INDEX users_email_token_hash_unique ON users (email_token_hash) WHERE email_token_hash IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX users_email_token_hash_unique');
        DB::statement('ALTER TABLE users DROP CONSTRAINT users_email_token_check, DROP CONSTRAINT users_setup_delivery_check,
            DROP COLUMN email_token_sent_at, DROP COLUMN email_token_hash, DROP COLUMN pending_email,
            DROP COLUMN setup_delivery, DROP COLUMN email_verified_at');
    }
};
