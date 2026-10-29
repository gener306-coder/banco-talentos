<?php

namespace App\Http\Controllers;

use App\Enums\EconomicSector;
use App\Enums\LinkageRequestStatus;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * Reporte ejecutivo del programa de Educación Dual (HU-S7-01). Solo conteos agregados: nunca consulta
 * student_identities ni student_social_security, ni devuelve datos de alumnos, cuentas o coordenadas. Los perfiles
 * buscables usan el mismo universo del buscador y del inicio (Student::scopeSearchable), que solo comprueba que el
 * punto exista.
 */
class ReportController extends Controller
{
    public function dualProgram(): JsonResponse
    {
        return response()->json(['data' => [
            'generated_at' => now()->toIso8601ZuluString(),
            'linkage_summary' => $this->linkageSummary(),
            'by_institution' => $this->byInstitution(),
            'by_sector' => $this->bySector(),
        ]])->header('Cache-Control', 'no-store, private');
    }

    /** CA-02: total y conteo por estado; un estado sin solicitudes vale 0. */
    private function linkageSummary(): array
    {
        $counts = LinkageRequest::query()->toBase()->selectRaw('status, count(*) AS total')->groupBy('status')->pluck('total', 'status');
        $byStatus = [];
        foreach (LinkageRequestStatus::cases() as $status) {
            $byStatus[$status->value] = (int) ($counts[$status->value] ?? 0);
        }

        return ['total' => array_sum($byStatus), 'by_status' => $byStatus];
    }

    /** CA-02: todas las instituciones, activas e inactivas, ordenadas por nombre. */
    private function byInstitution(): array
    {
        return Institution::query()
            ->select(['id', 'name', 'is_active'])
            ->withCount([
                'students as active_students' => fn (Builder $query) => $query->where('students.is_active', true),
                'students as searchable_profiles' => fn (Builder $query) => $query->searchable(),
                'linkageRequests as received_requests',
                'linkageRequests as accepted_requests' => fn (Builder $query) => $query->where('status', LinkageRequestStatus::ACCEPTED),
            ])
            ->orderBy('name')
            ->orderBy('id')
            ->get()
            ->map(fn (Institution $institution): array => [
                'id' => $institution->id,
                'name' => $institution->name,
                'is_active' => $institution->is_active,
                'active_students' => (int) $institution->active_students,
                'searchable_profiles' => (int) $institution->searchable_profiles,
                'received_requests' => (int) $institution->received_requests,
                'accepted_requests' => (int) $institution->accepted_requests,
            ])
            ->all();
    }

    /**
     * CA-02: sectores SCIAN con al menos una empresa registrada (toda oportunidad pertenece a una empresa), en el
     * orden del catálogo. Las oportunidades activas son las de empresas activas, como en el inicio (HU-S6-03); las
     * solicitudes aceptadas cuentan el historial completo del sector.
     */
    private function bySector(): array
    {
        $companies = Company::query()->toBase()
            ->selectRaw('sector_code, count(*) FILTER (WHERE is_active) AS active')
            ->groupBy('sector_code')
            ->pluck('active', 'sector_code');
        $opportunities = Opportunity::query()->toBase()
            ->join('companies', 'companies.id', '=', 'opportunities.company_id')
            ->where('companies.is_active', true)
            ->where('opportunities.is_active', true)
            ->selectRaw('companies.sector_code, count(*) AS total')
            ->groupBy('companies.sector_code')
            ->pluck('total', 'sector_code');
        $accepted = LinkageRequest::query()->toBase()
            ->join('companies', 'companies.id', '=', 'linkage_requests.company_id')
            ->where('linkage_requests.status', LinkageRequestStatus::ACCEPTED->value)
            ->selectRaw('companies.sector_code, count(*) AS total')
            ->groupBy('companies.sector_code')
            ->pluck('total', 'sector_code');

        $sectors = [];
        foreach (EconomicSector::cases() as $sector) {
            if (! $companies->has($sector->value)) {
                continue;
            }
            $sectors[] = [
                'sector_code' => $sector->value,
                'active_companies' => (int) $companies[$sector->value],
                'active_opportunities' => (int) ($opportunities[$sector->value] ?? 0),
                'accepted_requests' => (int) ($accepted[$sector->value] ?? 0),
            ];
        }

        return $sectors;
    }
}
