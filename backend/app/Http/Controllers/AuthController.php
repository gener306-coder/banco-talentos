<?php

namespace App\Http\Controllers;

use App\Exceptions\AccountAccessDenied;
use App\Http\Requests\LoginRequest;
use App\Models\Company;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        $restriction = null;
        $authenticated = Auth::guard('web')->attemptWhen(
            [...$credentials, 'is_active' => true],
            function (User $user) use (&$restriction): bool {
                $restriction = $user->accessRestriction();

                return $restriction === null;
            },
        );

        if ($restriction !== null) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            throw new AccountAccessDenied($restriction);
        }

        if (! $authenticated) {
            throw ValidationException::withMessages([
                'email' => ['Las credenciales proporcionadas no son válidas.'],
            ]);
        }

        $request->session()->regenerate();

        return $this->userResponse(Auth::guard('web')->user());
    }

    public function me(Request $request): JsonResponse
    {
        return $this->userResponse($request->user());
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    private function userResponse(User $user): JsonResponse
    {
        $user->loadMissing(['institution', 'company']);

        $data = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role->value,
            'institution' => null,
            // Empresa vinculada (HU-S4-03 CA-05): solo su nombre visible, sin datos internos de validación.
            'company' => $user->company ? [
                'id' => $user->company->id,
                // HU-S14-02: null mientras la empresa invitada no capture su nombre.
                'name' => $user->company->displayName(),
                // HU-S14-02: claves de lo que falta del perfil (sin valores); la interfaz decide qué recordar o habilitar.
                'missing' => $user->company->missing(),
                // HU-S14-03: el onboarding termina al guardar o posponer el perfil, o si ya está completo.
                'onboarding' => $user->company->onboarding_dismissed_at !== null || $user->company->missing() === [] ? 'done' : 'pending',
                'can_operate' => $user->company->missing(Company::MINIMUM) === [],
            ] : null,
        ];

        if ($user->institution) {
            $data['institution'] = [
                'id' => $user->institution->id,
                'name' => $user->institution->name,
            ];
        }

        return response()->json([
            'user' => $data,
        ])->header('Cache-Control', 'no-store, private');
    }
}
