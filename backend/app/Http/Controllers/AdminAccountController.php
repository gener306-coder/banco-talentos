<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\UpdateAccountStatusRequest;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cuentas de Administración (HU-S16-02): un ADMIN invita a otros por correo o con un enlace manual, los inactiva o
 * reactiva e inicia su restablecimiento. Nadie se inactiva a sí mismo y la plataforma nunca se queda sin un
 * Administrador activo.
 */
class AdminAccountController extends SetupRoleAccountController
{
    public const LAST_ADMIN = 'No puedes inactivar al último Administrador activo.';

    protected function role(): UserRole
    {
        return UserRole::ADMIN;
    }

    protected function noun(): string
    {
        return 'de Administración';
    }

    protected function resetInitiator(): string
    {
        return ResetInstitutionPassword::ADMIN_ACCOUNT_INITIATOR;
    }

    /**
     * CA-03: antes de bloquear la cuenta elegida se bloquean todas las cuentas ADMIN activas, siempre en orden de id.
     * Dos inactivaciones simultáneas se serializan (sin interbloqueos) y la segunda ve el conteo definitivo.
     */
    public function updateStatus(UpdateAccountStatusRequest $request, string $account): JsonResponse
    {
        if ($request->validated('is_active')) {
            return parent::updateStatus($request, $account);
        }

        return DB::transaction(function () use ($request, $account): JsonResponse {
            $active = User::query()->where('role', UserRole::ADMIN)->where('is_active', true)
                ->orderBy('id')->lockForUpdate()->pluck('id');
            if ($active->count() <= 1 && $active->contains((int) $account)) {
                throw ValidationException::withMessages(['is_active' => [self::LAST_ADMIN]]);
            }

            return parent::updateStatus($request, $account);
        });
    }
}
