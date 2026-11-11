<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Alta de una cuenta institucional (HU-S1-03, T-S8-11): la usan «Nueva cuenta institucional» y el registro de la
 * institución. Debe llamarse dentro de una transacción; el enlace se entrega después del commit.
 */
class InstitutionAccounts
{
    public function __construct(private readonly InitialPasswordLink $links) {}

    /** @return array{0: User, 1: string} La cuenta y su enlace de configuración inicial. */
    public function create(Institution $institution, string $name, string $email, User $creator): array
    {
        $user = new User([
            'name' => $name,
            'email' => $email,
            'institution_id' => $institution->id,
            'role' => UserRole::INSTITUTION,
            'is_active' => true,
            // Cumple NOT NULL sin proporcionar una credencial utilizable al ADMIN.
            'password' => Str::random(64),
        ]);
        $user->password_setup_required = true;
        $user->created_by = $creator->id;
        $user->save();
        $user->setRelation('institution', $institution);

        return [$user, $this->links->issue($user)];
    }
}
