<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use App\Http\Controllers\Concerns\ManagesAccountAccess;
use App\Http\Requests\CorrectPendingEmailRequest;
use App\Http\Requests\StoreInstitutionAccountRequest;
use App\Models\Institution;
use App\Models\User;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionAccounts;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InstitutionAccountController extends Controller
{
    use ManagesAccountAccess;

    /** T-S19-02: cuentas de la institución con su estado, para ver las pendientes y corregir su correo. */
    public function index(Institution $institution): JsonResponse
    {
        $accounts = User::query()
            ->where('role', UserRole::INSTITUTION)
            ->where('institution_id', $institution->id)
            ->orderBy('name')
            ->orderBy('id')
            ->get(['id', 'name', 'email', 'is_active', 'password_setup_required', 'email_verified_at', 'created_at']);

        return response()->json(['data' => $accounts->map(fn (User $user): array => $user->setupAccountSummary())->values()])
            ->header('Cache-Control', 'no-store, private');
    }

    /** T-S19-02: corrige el correo de una cuenta institucional pendiente y le reenvía el enlace; la institución debe estar activa. */
    public function correctEmail(CorrectPendingEmailRequest $request, Institution $institution, string $account, InitialPasswordLink $links): JsonResponse
    {
        $accounts = User::query()->where('role', UserRole::INSTITUTION)->where('institution_id', $institution->id);

        return $this->correctPendingEmail($request, $accounts, $account, $request->validated('email'), $links, function () use ($institution): void {
            if (! Institution::query()->lockForUpdate()->find($institution->id)?->is_active) {
                throw ValidationException::withMessages(['institution_id' => ['La institución no existe o no está activa.']]);
            }
        });
    }

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
                    'name' => $user->institution->label(),
                ],
            ],
        ];

        return response()->json($response, 201)->header('Cache-Control', 'no-store, private');
    }
}
