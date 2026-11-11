<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Alta de una cuenta de empresa (HU-S4-03, T-S8-12): la usan «Cuentas de la empresa» y el registro de la empresa.
 * Debe llamarse dentro de una transacción; el enlace se entrega después del commit.
 */
class CompanyAccounts
{
    public function __construct(private readonly InitialPasswordLink $links) {}

    /** @return array{0: User, 1: string} La cuenta y su enlace de configuración inicial. */
    public function create(Company $company, string $name, string $email, User $creator): array
    {
        $user = new User([
            'name' => $name,
            'email' => $email,
            'role' => UserRole::COMPANY,
            'is_active' => true,
            // Cumple NOT NULL sin proporcionar una credencial utilizable a quien crea la cuenta.
            'password' => Str::random(64),
        ]);
        $user->company_id = $company->id;
        $user->password_setup_required = true;
        $user->created_by = $creator->id;
        $user->save();

        return [$user, $this->links->issue($user)];
    }
}
