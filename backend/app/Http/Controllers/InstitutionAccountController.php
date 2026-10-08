<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use App\Http\Requests\StoreInstitutionAccountRequest;
use App\Models\Institution;
use App\Models\User;
use App\Services\InitialPasswordLink;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InstitutionAccountController extends Controller
{
    public function store(StoreInstitutionAccountRequest $request, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);
        unset($data['delivery_method']);

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($data, $links): array {
                // Revalidar bajo bloqueo cubre una inactivación posterior al FormRequest.
                $institution = Institution::query()->lockForUpdate()->find($data['institution_id']);
                if (! $institution || ! $institution->is_active) {
                    throw ValidationException::withMessages([
                        'institution_id' => ['La institución no existe o no está activa.'],
                    ]);
                }

                $user = new User([
                    ...$data,
                    'role' => UserRole::INSTITUTION,
                    'is_active' => true,
                    // Cumple NOT NULL sin proporcionar una credencial utilizable al ADMIN.
                    'password' => Str::random(64),
                ]);
                $user->password_setup_required = true;
                $user->save();
                $user->setRelation('institution', $institution);

                $setupUrl = $links->issue($user);

                return [$user, $setupUrl];
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
