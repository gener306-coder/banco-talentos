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
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Perfil de la organización de la sesión (HU-S14-02). La organización sale siempre de la sesión (company_id o
 * institution_id); ninguna ruta ni cuerpo acepta un id. Solo cambian los campos de la lista de la FormRequest; el sector
 * de la empresa se establece una sola vez y después solo la Secretaría lo cambia (D2).
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

        $organization = DB::transaction(function () use ($user, $data): Company|Institution {
            // La fila se bloquea: dos guardados simultáneos no pueden establecer el sector dos veces.
            $organization = $this->organization($user, lock: true);

            if ($organization instanceof Company) {
                $sector = $data['sector_code'] ?? null;
                unset($data['sector_code']);
                if ($sector !== null && $organization->sector_code?->value !== $sector) {
                    if ($organization->sector_code !== null) {
                        throw ValidationException::withMessages([
                            'sector_code' => 'El sector ya está establecido. Para cambiarlo, escribe a la Secretaría de Economía.',
                        ]);
                    }
                    $organization->sector_code = $sector;
                }
            }

            $organization->fill($data);
            $changed = array_values(array_diff(array_keys($organization->getDirty()), ['location', 'updated_at']));
            if ($changed === []) {
                return $organization;
            }
            if ($organization instanceof Company && $organization->isDirty('municipality_code')) {
                $organization->location = Municipality::locationOf($organization->municipality_code);
            }
            $organization->save();
            AccountAuditEvent::record($user, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $organization, $changed);

            return $organization;
        });

        // M2 (HU-S14-02): sin aviso por correo a la Secretaría; los cambios quedan en la bitácora.
        return $this->respond($organization->refresh());
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
            ]
            : [
                'type' => 'institution',
                'name' => $organization->name,
                'cct' => $organization->cct,
                ...$contact,
            ];

        return response()->json(['data' => $data])->header('Cache-Control', 'no-store, private');
    }
}
