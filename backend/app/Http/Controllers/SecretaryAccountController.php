<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use App\Http\Controllers\Concerns\ManagesAccountAccess;
use App\Http\Requests\ResendSetupLinkRequest;
use App\Http\Requests\StartAccountPasswordResetRequest;
use App\Http\Requests\StoreSetupAccountRequest;
use App\Http\Requests\UpdateAccountStatusRequest;
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
 * Cuentas de la Secretaría de Economía (HU-S4-01): ADMIN y SECRETARY las listan, crean y reenvían su enlace de
 * configuración. Nadie define ni ve la contraseña; no hay edición (CA-02). Desde HU-S6-04 las activan o inactivan e
 * inician su restablecimiento de contraseña.
 */
class SecretaryAccountController extends Controller
{
    use ManagesAccountAccess;

    private const PER_PAGE = 50;

    public function index(): JsonResponse
    {
        $page = User::query()
            ->where('role', UserRole::SECRETARY)
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(self::PER_PAGE, ['id', 'name', 'email', 'is_active', 'password_setup_required', 'created_at']);

        return response()->json([
            'data' => $page->getCollection()->map(fn (User $user): array => $user->setupAccountSummary())->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    public function store(StoreSetupAccountRequest $request, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($data, $links, $request): array {
                $user = new User([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'role' => UserRole::SECRETARY,
                    'is_active' => true,
                    // Cumple NOT NULL sin proporcionar una credencial utilizable a quien crea la cuenta.
                    'password' => Str::random(64),
                ]);
                $user->password_setup_required = true;
                $user->created_by = $request->user()->id;
                $user->save();

                return [$user, $links->issue($user)];
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos altas simultáneas con el mismo correo: la restricción es la última garantía (CA-07).
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

    public function resendSetup(ResendSetupLinkRequest $request, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);

        [$user, $setupUrl] = DB::transaction(function () use ($data, $links): array {
            // Mismo bloqueo que al consumir el enlace: el usuario.
            $user = User::query()->where('email', $data['email'])->lockForUpdate()->first();
            if (! $user || $user->role !== UserRole::SECRETARY || ! $user->password_setup_required || ! $user->is_active) {
                throw ValidationException::withMessages([
                    'email' => ['No hay una cuenta de la Secretaría activa pendiente de configuración con ese correo.'],
                ]);
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

    /** HU-S6-04 CA-01: una cuenta que no es SECRETARY responde 404, igual que una inexistente. */
    public function updateStatus(UpdateAccountStatusRequest $request, string $account): JsonResponse
    {
        $user = $this->changeAccountStatus($request, $this->accounts(), $account, $request->validated('is_active'));

        return response()->json(['data' => $user->setupAccountSummary()])->header('Cache-Control', 'no-store, private');
    }

    /** HU-S6-04 CA-02: restablecimiento por correo de una cuenta SECRETARY activa con contraseña establecida. */
    public function startPasswordReset(StartAccountPasswordResetRequest $request, InstitutionPasswordResetLink $links): JsonResponse
    {
        return $this->startAccountReset($this->accounts(), $request->validated('email'), $links, ResetInstitutionPassword::SECRETARY_INITIATOR,
            fn () => throw ValidationException::withMessages(['email' => ['No hay una cuenta de la Secretaría con ese correo.']]));
    }

    private function accounts(): Builder
    {
        return User::query()->where('role', UserRole::SECRETARY);
    }
}
