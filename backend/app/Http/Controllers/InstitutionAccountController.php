<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\StoreInstitutionAccountRequest;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class InstitutionAccountController extends Controller
{
    public function store(StoreInstitutionAccountRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['role'] = UserRole::INSTITUTION;
        $data['is_active'] = true;

        try {
            $user = User::create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'email' => ['El correo electrónico ya está registrado.'],
            ]);
        }

        $user->load('institution');

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role->value,
                'is_active' => $user->is_active,
                'institution' => [
                    'id' => $user->institution->id,
                    'name' => $user->institution->name,
                ],
            ],
        ], 201);
    }
}
