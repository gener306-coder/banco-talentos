<?php

namespace App\Http\Controllers;

use App\Enums\EconomicSector;
use App\Enums\LinkageRequestStatus;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Support\CsvExport;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Reporte ejecutivo del programa de Educación Dual (HU-S7-01). Solo conteos agregados: nunca consulta
 * student_identities ni student_social_security, ni devuelve datos de alumnos, cuentas o coordenadas. Los perfiles
 * buscables usan el mismo universo del buscador y del inicio (Student::scopeSearchable), que solo comprueba que el
 * punto exista. HU-S7-02 exporta el desglose por institución y por sector en CSV con los mismos conteos.
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

    /** HU-S7-02 CA-01: desglose por institución y por sector SCIAN, sin ningún dato personal de alumnos. */
    public function export(): StreamedResponse
    {
        $institutions = array_map(fn (array $item): array => [
            $item['name'], $item['is_active'] ? 'Activa' : 'Inactiva', $item['active_students'], $item['searchable_profiles'],
            $item['received_requests'], $item['accepted_requests'],
        ], $this->byInstitution());
        $sectors = array_map(fn (array $item): array => [
            $item['sector_code'], EconomicSector::from($item['sector_code'])->label(), $item['active_companies'],
            $item['active_opportunities'], $item['accepted_requests'],
        ], $this->bySector());

        return CsvExport::download('reporte-educacion-dual-'.now()->format('Y-m-d').'.csv', [
            [['Institución', 'Estado', 'Alumnos activos', 'Perfiles buscables', 'Solicitudes recibidas', 'Solicitudes aceptadas'], $institutions],
            [['Código SCIAN', 'Sector', 'Empresas activas', 'Oportunidades activas', 'Solicitudes aceptadas'], $sectors],
        ]);
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

    /**
     * CA-02: todas las instituciones, activas e inactivas, ordenadas por nombre. Los conteos salen de una sola
     * agregación por tabla (T-S8-01): alumnos y solicitudes se recorren una vez, sin importar cuántas instituciones haya.
     */
    private function byInstitution(): array
    {
        $students = Student::query()->toBase()
            ->selectRaw('institution_id, count(*) FILTER (WHERE students.is_active) AS active, count(*) FILTER (WHERE '.Student::searchableCondition().') AS searchable')
            ->groupBy('institution_id')
            ->get()
            ->keyBy('institution_id');
        $linkages = LinkageRequest::query()->toBase()
            ->selectRaw('institution_id, count(*) AS received, count(*) FILTER (WHERE status = ?) AS accepted', [LinkageRequestStatus::ACCEPTED->value])
            ->groupBy('institution_id')
            ->get()
            ->keyBy('institution_id');

        return Institution::query()
            ->orderBy('name')
            ->orderBy('id')
            ->get(['id', 'name', 'is_active'])
            ->map(fn (Institution $institution): array => [
                'id' => $institution->id,
                'name' => $institution->name,
                'is_active' => $institution->is_active,
                'active_students' => (int) ($students[$institution->id]->active ?? 0),
                'searchable_profiles' => (int) ($students[$institution->id]->searchable ?? 0),
                'received_requests' => (int) ($linkages[$institution->id]->received ?? 0),
                'accepted_requests' => (int) ($linkages[$institution->id]->accepted ?? 0),
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
