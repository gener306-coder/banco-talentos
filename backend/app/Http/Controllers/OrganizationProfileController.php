<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\UpdateOrganizationProfileRequest;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\Municipality;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Perfil de la organización de la sesión (HU-S14-02, HU-S14-03). La organización sale siempre de la sesión (company_id
 * o institution_id); ninguna ruta ni cuerpo acepta un id. Solo cambian los campos de la lista de la FormRequest: la
 * empresa captura todo su perfil y la institución, el contacto de su programa dual.
 */
class OrganizationProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return $this->respond($this->organization($request->user()));
    }

    public function update(UpdateOrganizationProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();
        // Vacío o ausente conserva el nombre de la cuenta (guardado parcial del onboarding).
        $accountName = $data['account_name'] ?? null;
        unset($data['account_name']);

        $organization = DB::transaction(function () use ($user, $data, $accountName): Company|Institution {
            // La fila se bloquea: el guardado y una publicación simultánea (M1) se ordenan.
            $organization = $this->organization($user, lock: true);
            $organization->fill($data);
            $changed = array_values(array_diff(array_keys($organization->getDirty()), ['location', 'updated_at']));
            if ($organization instanceof Company) {
                if ($organization->isDirty('municipality_code')) {
                    $organization->location = $organization->municipality_code === null ? null : Municipality::locationOf($organization->municipality_code);
                }
            }
            // HU-S14-03 CA-02 y HU-S16-07: guardar el perfil, aunque sea en parcial, termina el onboarding.
            $organization->onboarding_dismissed_at ??= now();
            if ($organization->isDirty()) {
                $organization->save();
            }
            if ($changed !== []) {
                AccountAuditEvent::record($user, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $organization, $changed);
            }

            // CA-03: con «Soy yo», el nombre del contacto también corrige el de la cuenta (p. ej. el provisional, M3).
            // T-S14-09: solo si el nombre del contacto cambió en este guardado o la cuenta aún tiene el nombre provisional.
            // Un formulario abierto con una copia vieja ya no devuelve la cuenta a un nombre anterior.
            // T-S14-15: aplica igual a la institución.
            $renamesAccount = in_array('contact_name', $changed, true) || $user->name === $user->email;
            if ($accountName !== null && $accountName !== $user->name && $renamesAccount) {
                $user->name = $accountName;
                $user->save();
                AccountAuditEvent::record($user, AccountAuditEvent::ACCOUNT_UPDATED, $user, ['name']);
            }

            return $organization;
        });

        // M2 (HU-S14-02): sin aviso por correo a la Secretaría; los cambios quedan en la bitácora.
        return $this->respond($organization->refresh());
    }

    /**
     * HU-S14-03 CA-02 y HU-S16-07: «Completar más tarde» termina el onboarding de la empresa o la institución sin guardar
     * datos ni registrar un evento.
     */
    public function postpone(Request $request): Response
    {
        $user = $request->user();
        $query = match ($user->role) {
            UserRole::COMPANY => Company::query()->whereKey($user->company_id),
            UserRole::INSTITUTION => Institution::query()->whereKey($user->institution_id),
            default => abort(403, 'Solo las empresas y las instituciones tienen un perfil por completar.'),
        };
        $query->whereNull('onboarding_dismissed_at')->update(['onboarding_dismissed_at' => now()]);

        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }

    private function organization(User $user, bool $lock = false): Company|Institution
    {
        $query = $user->role === UserRole::COMPANY
            ? Company::query()->whereKey($user->company_id)
            : Institution::query()->whereKey($user->institution_id);
        $organization = $query->when($lock, fn ($query) => $query->lockForUpdate())->first();
        abort_if($organization === null, 404, 'La organización no existe.');

        return $organization;
    }

    /** Lista explícita de campos: sin ids internos, folio de validación, autoría ni coordenadas. */
    private function respond(Company|Institution $organization): JsonResponse
    {
        $contact = [
            'contact_name' => $organization->contact_name,
            'contact_position' => $organization->contact_position,
            'contact_email' => $organization->contact_email,
            'contact_phone' => $organization->contact_phone,
        ];
        $data = $organization instanceof Company
            ? [
                'type' => 'company',
                'name' => $organization->displayName(),
                'legal_name' => $organization->legal_name,
                'rfc' => $organization->rfc,
                'sector_code' => $organization->sector_code?->value,
                'trade_name' => $organization->trade_name,
                'state_code' => $organization->state_code?->value,
                'municipality_code' => $organization->municipality_code,
                'municipality' => $organization->municipality?->name,
                ...$contact,
                // HU-S14-03: lo que falta (sin valores) y si ya puede operar (M1), para actualizar la sesión.
                'missing' => $organization->missing(),
                'can_operate' => $organization->missing(Company::MINIMUM) === [],
            ]
            : [
                'type' => 'institution',
                'name' => $organization->name,
                'cct' => $organization->cct,
                ...$contact,
                // HU-S16-07: lo que falta del mínimo (D6) y si ya puede operar, para actualizar la sesión.
                'missing' => $organization->missing(),
                'can_operate' => $organization->missing() === [],
            ];

        return response()->json(['data' => $data])->header('Cache-Control', 'no-store, private');
    }
}
