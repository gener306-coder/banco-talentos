<?php

namespace App\Http\Controllers;

use App\Enums\LinkageRequestStatus;
use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Indicadores del inicio por rol (HU-S5-01). Solo devuelve conteos: ningún dato de alumnos, organizaciones ni
 * cuentas. INSTITUTION cuenta exclusivamente los alumnos de su institución (CA-04); una cuenta INSTITUTION o
 * COMPANY sin organización vinculada no consulta nada y recibe metrics: null (CA-06). HU-S6-03 añade los indicadores de
 * oportunidades y solicitudes de vinculación con el mismo aislamiento.
 */
class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        $metrics = match ($user->role) {
            UserRole::ADMIN => $this->admin(),
            UserRole::SECRETARY => $this->secretary(),
            UserRole::INSTITUTION => $user->institution_id === null ? null : $this->institution($user->institution_id),
            UserRole::COMPANY => $user->company_id === null ? null : $this->company($user->company_id),
        };

        return response()->json(['data' => ['role' => $user->role->value, 'metrics' => $metrics]])
            ->header('Cache-Control', 'no-store, private');
    }

    /** CA-02 */
    private function admin(): array
    {
        $institutions = Institution::query()->selectRaw('count(*) FILTER (WHERE is_active) AS active, count(*) FILTER (WHERE NOT is_active) AS inactive')->first();

        return [
            'active_institutions' => (int) $institutions->active,
            'inactive_institutions' => (int) $institutions->inactive,
            'active_secretaries' => $this->secretaries(setupRequired: false),
            'pending_secretaries' => $this->secretaries(setupRequired: true),
            ...$this->linkageProgram(),
        ];
    }

    /** CA-03 */
    private function secretary(): array
    {
        $companies = Company::query()->selectRaw('count(*) FILTER (WHERE is_active) AS active, count(*) FILTER (WHERE NOT is_active) AS inactive')->first();

        return [
            'active_companies' => (int) $companies->active,
            'inactive_companies' => (int) $companies->inactive,
            'pending_secretaries' => $this->secretaries(setupRequired: true),
            ...$this->linkageProgram(),
        ];
    }

    /** CA-04: la institución está activa, lo garantiza el middleware `active`. */
    private function institution(int $institutionId): array
    {
        $own = fn () => Student::query()->where('students.institution_id', $institutionId);

        return [
            'active_students' => $own()->where('students.is_active', true)->count(),
            'searchable_students' => $own()->searchable()->count(),
            // «Municipio por confirmar» (HU-S4-04), activos o inactivos.
            'pending_municipality_students' => $own()->whereNotNull('students.legacy_municipality')->whereNull('students.municipality_code')->count(),
            // HU-S6-03 CA-01: solicitudes que esperan la respuesta de la institución.
            'pending_linkage_requests' => $this->pendingLinkages('institution_id', $institutionId),
        ];
    }

    /** CA-05: el mismo universo del buscador (HU-S4-05 CA-02). La empresa está activa, lo garantiza `active`. */
    private function company(int $companyId): array
    {
        return [
            'available_talent_profiles' => Student::query()
                ->join('institutions', 'institutions.id', '=', 'students.institution_id')
                ->where('institutions.is_active', true)
                ->searchable()
                ->count(),
            // HU-S6-03 CA-01: solo las oportunidades y solicitudes de su empresa.
            'active_opportunities' => Opportunity::query()->where('company_id', $companyId)->where('is_active', true)->count(),
            'pending_linkage_requests' => $this->pendingLinkages('company_id', $companyId),
        ];
    }

    /** HU-S6-03 CA-01: avance general del programa dual para ADMIN y SECRETARY; solo conteos. */
    private function linkageProgram(): array
    {
        return [
            'active_opportunities' => Opportunity::query()
                ->join('companies', 'companies.id', '=', 'opportunities.company_id')
                ->where('companies.is_active', true)
                ->where('opportunities.is_active', true)
                ->count(),
            'accepted_linkage_requests' => LinkageRequest::query()->where('status', LinkageRequestStatus::ACCEPTED)->count(),
        ];
    }

    private function pendingLinkages(string $column, int $organizationId): int
    {
        return LinkageRequest::query()->where($column, $organizationId)->where('status', LinkageRequestStatus::PENDING_INSTITUTION)->count();
    }

    /** Cuentas SECRETARY activas, ya configuradas o pendientes de su primera contraseña. */
    private function secretaries(bool $setupRequired): int
    {
        return User::query()->where('role', UserRole::SECRETARY)->where('is_active', true)
            ->where('password_setup_required', $setupRequired)->count();
    }
}
