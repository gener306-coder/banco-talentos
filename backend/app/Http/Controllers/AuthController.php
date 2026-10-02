<?php

namespace App\Http\Controllers;

use App\Exceptions\AccountAccessDenied;
use App\Http\Requests\LoginRequest;
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
        $user->loadMissing('institution');

        $data = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role->value,
            'institution' => null,
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
