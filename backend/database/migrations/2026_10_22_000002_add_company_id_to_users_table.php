<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cuentas de empresa (HU-S4-03). CA-03: la base garantiza la coherencia entre rol y organización.
     * COMPANY tiene empresa y no institución; ADMIN y SECRETARY no tienen ninguna; INSTITUTION no tiene empresa.
     * Una cuenta INSTITUTION sin institución sigue siendo posible: es el caso que HU-S2-02 ya contempla (403 al padrón).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('company_id')->nullable()->after('institution_id')->constrained()->restrictOnDelete();
        });

        // NOT VALID no revisa las filas existentes: una base local podría tener cuentas COMPANY creadas con
        // `auth:create-user` antes de que existieran las empresas. Las filas nuevas o modificadas sí se comprueban.
        DB::statement(<<<'SQL'
            ALTER TABLE users ADD CONSTRAINT users_role_organization CHECK (
                (role = 'COMPANY' AND company_id IS NOT NULL AND institution_id IS NULL)
                OR (role = 'INSTITUTION' AND company_id IS NULL)
                OR (role IN ('ADMIN', 'SECRETARY') AND company_id IS NULL AND institution_id IS NULL)
            ) NOT VALID
            SQL);

        $violations = DB::table('users')->where(fn ($query) => $query
            ->where(fn ($company) => $company->where('role', 'COMPANY')->where(fn ($bad) => $bad->whereNull('company_id')->orWhereNotNull('institution_id')))
            ->orWhere(fn ($admin) => $admin->whereIn('role', ['ADMIN', 'SECRETARY'])->where(fn ($bad) => $bad->whereNotNull('company_id')->orWhereNotNull('institution_id'))))
            ->exists();
        if (! $violations) {
            DB::statement('ALTER TABLE users VALIDATE CONSTRAINT users_role_organization');
        }
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_organization');
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('company_id');
        });
    }
};
