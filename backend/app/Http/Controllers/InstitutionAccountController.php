<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Http\Requests\StoreInstitutionAccountRequest;
use App\Models\Institution;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionAccounts;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InstitutionAccountController extends Controller
{
    public function store(StoreInstitutionAccountRequest $request, InitialPasswordLink $links, InstitutionAccounts $accounts): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);
        unset($data['delivery_method']);

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($data, $accounts, $request): array {
                // Revalidar bajo bloqueo cubre una inactivación posterior al FormRequest.
                $institution = Institution::query()->lockForUpdate()->find($data['institution_id']);
                if (! $institution || ! $institution->is_active) {
                    throw ValidationException::withMessages([
                        'institution_id' => ['La institución no existe o no está activa.'],
                    ]);
                }

                return $accounts->create($institution, $data['name'], $data['email'], $request->user());
            });
        } catch (UniqueConstraintViolationException $exception) {
            if ($exception->index !== 'users_email_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages([
                'email' => ['El correo electrónico ya está registrado.'],
            ]);
        }

        // La cuenta y el token ya están confirmados antes de contactar al transporte o
        // de devolver el enlace manual.
        $response = [
            ...$links->deliver($user, $setupUrl, $method, $request->user()->id),
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
        ];

        return response()->json($response, 201)->header('Cache-Control', 'no-store, private');
    }
}
