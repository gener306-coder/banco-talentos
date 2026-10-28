<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use App\Http\Controllers\Concerns\ManagesAccountAccess;
use App\Http\Requests\ResendSetupLinkRequest;
use App\Http\Requests\StartAccountPasswordResetRequest;
use App\Http\Requests\StoreSetupAccountRequest;
use App\Http\Requests\UpdateAccountStatusRequest;
use App\Models\Company;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionPasswordResetLink;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

/**
 * Cuentas de acceso de una empresa (HU-S4-03): SECRETARY las lista, crea y reenvía su enlace desde el detalle de la
 * empresa. El rol COMPANY y la empresa los asigna el servidor a partir de la ruta (CA-01). Desde HU-S6-04 también las
 * activa o inactiva e inicia su restablecimiento de contraseña.
 */
class CompanyAccountController extends Controller
{
    use ManagesAccountAccess;

    public function index(string $company): JsonResponse
    {
        $record = $this->find($company);
        $accounts = User::query()
            ->where('company_id', $record->id)
            ->orderBy('name')
            ->orderBy('id')
            ->get(['id', 'name', 'email', 'is_active', 'password_setup_required', 'created_at']);

        return response()->json(['data' => $accounts->map(fn (User $user): array => $user->setupAccountSummary())->values()])
            ->header('Cache-Control', 'no-store, private');
    }

    public function store(StoreSetupAccountRequest $request, string $company, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);
        $companyId = $this->find($company)->id;

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($data, $links, $request, $companyId): array {
                // Revalidar bajo bloqueo cubre una inactivación concurrente (CA-01).
                $record = Company::query()->lockForUpdate()->find($companyId);
                if (! $record?->is_active) {
                    throw ValidationException::withMessages(['company' => ['La empresa está inactiva: actívala para crear cuentas.']]);
                }

                $user = new User([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'role' => UserRole::COMPANY,
                    'is_active' => true,
                    // Cumple NOT NULL sin proporcionar una credencial utilizable a quien crea la cuenta.
                    'password' => Str::random(64),
                ]);
                $user->company_id = $record->id;
                $user->password_setup_required = true;
                $user->created_by = $request->user()->id;
                $user->save();

                return [$user, $links->issue($user)];
            });
        } catch (UniqueConstraintViolationException $exception) {
            if ($exception->index !== 'users_email_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['email' => ['El correo electrónico ya está registrado.']]);
        }

        return response()->json([
            ...$links->deliver($user, $setupUrl, $method, $request->user()->id),
            'data' => $user->refresh()->setupAccountSummary(),
        ], 201)->header('Cache-Control', 'no-store, private');
    }

    public function resendSetup(ResendSetupLinkRequest $request, string $company, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);
        $companyId = $this->find($company)->id;

        [$user, $setupUrl] = DB::transaction(function () use ($data, $links, $companyId): array {
            // Mismo orden de bloqueos que al consumir el enlace: usuario y empresa.
            $user = User::query()->where('email', $data['email'])->lockForUpdate()->first();
            if (! $user || $user->role !== UserRole::COMPANY || $user->company_id !== $companyId
                || ! $user->password_setup_required || ! $user->is_active) {
                throw ValidationException::withMessages([
                    'email' => ['No hay una cuenta activa pendiente de configuración con ese correo en esta empresa.'],
                ]);
            }
            if (! Company::query()->lockForUpdate()->find($companyId)?->is_active) {
                throw ValidationException::withMessages(['company' => ['La empresa está inactiva: actívala para reenviar el enlace.']]);
            }

            // Se aplica bajo bloqueo y sobre el token persistido; no depende del proceso HTTP.
            if (Password::broker('institution_setup')->getRepository()->recentlyCreatedToken($user)) {
                throw new TooManyRequestsHttpException(60, 'Espera un minuto antes de reenviar el enlace.');
            }

            return [$user, $links->issue($user)];
        });

        return response()->json($links->deliver($user, $setupUrl, $method, $request->user()->id))
            ->header('Cache-Control', 'no-store, private');
    }

    /** HU-S6-04 CA-03: una cuenta de otra empresa responde 404, igual que una inexistente. */
    public function updateStatus(UpdateAccountStatusRequest $request, string $company, string $account): JsonResponse
    {
        $companyId = $this->find($company)->id;
        $user = $this->changeAccountStatus($request, $this->accounts($companyId), $account, $request->validated('is_active'),
            fn () => $this->ensureActive($companyId, 'La empresa está inactiva: actívala para cambiar el estado de sus cuentas.'));

        return response()->json(['data' => $user->setupAccountSummary()])->header('Cache-Control', 'no-store, private');
    }

    /** HU-S6-04 CA-03: restablecimiento por correo de una cuenta COMPANY de esta empresa. */
    public function startPasswordReset(StartAccountPasswordResetRequest $request, string $company, InstitutionPasswordResetLink $links): JsonResponse
    {
        $companyId = $this->find($company)->id;

        return $this->startAccountReset($this->accounts($companyId), $request->validated('email'), $links, ResetInstitutionPassword::SECRETARY_INITIATOR,
            fn () => abort(404, 'La cuenta no existe.'),
            fn () => $this->ensureActive($companyId, 'La empresa está inactiva: actívala para restablecer la contraseña de sus cuentas.'));
    }

    /** Cuentas COMPANY de la empresa de la ruta. */
    private function accounts(int $companyId): Builder
    {
        return User::query()->where('role', UserRole::COMPANY)->where('company_id', $companyId);
    }

    /** Revalidar bajo bloqueo cubre una inactivación concurrente de la empresa. */
    private function ensureActive(int $companyId, string $message): void
    {
        if (! Company::query()->lockForUpdate()->find($companyId)?->is_active) {
            throw ValidationException::withMessages(['company' => [$message]]);
        }
    }

    private function find(string $id): Company
    {
        $company = Company::query()->find((int) $id);
        abort_if($company === null, 404, 'La empresa no existe.');

        return $company;
    }
}
