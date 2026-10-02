<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Exceptions\AccountAccessDenied;
use App\Http\Requests\SetInitialPasswordRequest;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class InitialPasswordController extends Controller
{
    public function store(SetInitialPasswordRequest $request): Response
    {
        $data = $request->validated();

        DB::transaction(function () use ($data): void {
            // Serializa el consumo del enlace: incluso dos envíos simultáneos
            // deben observar password_setup_required antes de cambiar la contraseña.
            $user = User::query()->where('email', $data['email'])->lockForUpdate()->first();
            $broker = Password::broker('institution_setup');
            if (! $user || $user->role !== UserRole::INSTITUTION || ! $user->password_setup_required
                || ! $user->institution_id || ! $broker->tokenExists($user, $data['token'])) {
                $this->invalidToken();
            }

            $institution = Institution::query()->lockForUpdate()->find($user->institution_id);
            if (! $institution || ! $institution->is_active) {
                throw new AccountAccessDenied('INSTITUTION_INACTIVE', 403);
            }
            if (! $user->is_active) {
                throw new AccountAccessDenied('ACCOUNT_INACTIVE', 403);
            }

            $status = $broker->reset($data, function (User $account, string $password): void {
                // Tratar incluso una cadena con formato bcrypt como contraseña literal.
                $account->password = Hash::make($password);
                $account->password_setup_required = false;
                $account->save();
            });
            if ($status !== Password::PASSWORD_RESET) {
                $this->invalidToken();
            }
        });

        // No inicia sesión automáticamente ni altera la sesión de otro usuario.
        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }

    private function invalidToken(): never
    {
        throw ValidationException::withMessages([
            'token' => ['El enlace de configuración no es válido o ha expirado.'],
        ]);
    }
}
