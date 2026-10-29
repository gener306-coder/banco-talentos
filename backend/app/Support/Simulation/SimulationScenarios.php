<?php

namespace App\Support\Simulation;

use App\Models\Student;
use Illuminate\Support\Facades\DB;

/**
 * Escenarios que miden la simulación de carga: la cuenta de demostración de cada rol y las rutas reales que abre la
 * SPA en sus vistas principales. Los usan simulation:benchmark (HTTP) y simulation:explain (planes de consulta).
 */
final class SimulationScenarios
{
    /**
     * @return list<array{role: string, email: string, label: string, path: string, search: bool}>
     */
    public static function build(int $companyAccounts = 3): array
    {
        // La institución activa con más alumnos y su primera cuenta, que siempre está configurada.
        $institution = DB::table('institutions')
            ->where('is_active', true)
            ->select('institutions.id')
            ->selectSub(fn ($query) => $query->from('students')->selectRaw('count(*)')->whereColumn('students.institution_id', 'institutions.id'), 'students')
            ->orderByDesc('students')
            ->first();
        $institutionEmail = DB::table('users')->where('institution_id', $institution->id)->where('password_setup_required', false)->orderBy('id')->value('email');
        $students = (int) $institution->students;
        $lastPage = max(1, (int) ceil($students / 50));
        $studentId = DB::table('students')->where('institution_id', $institution->id)->whereNotNull('program')->orderBy('id')->value('id');

        $companies = DB::table('users')->join('companies', 'companies.id', '=', 'users.company_id')
            ->where('companies.is_active', true)->where('users.password_setup_required', false)
            ->orderBy('users.id')->limit($companyAccounts)->pluck('users.email')->all();
        $publicId = Student::query()->join('institutions', 'institutions.id', '=', 'students.institution_id')
            ->where('institutions.is_active', true)->searchable()->orderBy('students.id')->value('students.public_id');
        $skill = DB::table('student_skills')->join('skills', 'skills.id', '=', 'student_skills.skill_id')->where('skills.kind', 'technical')
            ->groupBy('skills.name')->orderByRaw('count(*) DESC')->value('skills.name');
        $program = DB::table('students')->whereNotNull('program')->groupBy('program')->orderByRaw('count(*) DESC')->value('program');
        $auditPages = max(1, (int) ceil(self::auditEvents() / 30));

        $secretary = 'secretaria01@'.SimulationDataset::DOMAIN;
        $admin = 'admin@'.SimulationDataset::DOMAIN;
        $talent = fn (string $label, string $query) => ['role' => 'COMPANY', 'label' => $label, 'path' => '/api/talent'.$query, 'search' => true];

        return [
            ...array_map(fn (array $item) => [...$item, 'role' => 'INSTITUTION', 'email' => $institutionEmail], [
                ['label' => "Padrón, página 1 ({$students} alumnos)", 'path' => '/api/students?page=1', 'search' => false],
                ['label' => "Padrón, última página ({$lastPage})", 'path' => "/api/students?page={$lastPage}", 'search' => false],
                ['label' => 'Detalle de alumno', 'path' => "/api/students/{$studentId}", 'search' => false],
                ['label' => 'CV del alumno', 'path' => "/api/students/{$studentId}/cv", 'search' => false],
                ['label' => 'Inicio (indicadores)', 'path' => '/api/dashboard', 'search' => false],
                ['label' => 'Bandeja de solicitudes', 'path' => '/api/institution/linkage-requests?page=1', 'search' => false],
                ['label' => 'Bandeja filtrada (pendientes)', 'path' => '/api/institution/linkage-requests?page=1&status=PENDIENTE_INSTITUCION', 'search' => false],
                ['label' => 'Exportación CSV de la bandeja', 'path' => '/api/institution/linkage-requests/export.csv', 'search' => false],
            ]),
            ...array_map(fn (array $item) => [...$item, 'email' => $companies], [
                $talent('Buscador sin filtros', '?page=1'),
                $talent("Buscador por habilidad ({$skill})", '?'.http_build_query(['skills' => [$skill], 'page' => 1])),
                $talent('Buscador con radio de 50 km', '?radius_km=50&page=1'),
                $talent('Buscador combinado', '?'.http_build_query(['skills' => [$skill], 'program' => $program, 'language' => 'en', 'min_level' => 3, 'dual_available' => 1, 'radius_km' => 100, 'page' => 1])),
                ['role' => 'COMPANY', 'label' => 'Perfil público', 'path' => "/api/talent/{$publicId}", 'search' => true],
                ['role' => 'COMPANY', 'label' => 'Bandeja de la empresa', 'path' => '/api/linkage-requests?page=1', 'search' => false],
                ['role' => 'COMPANY', 'label' => 'Oportunidades de la empresa', 'path' => '/api/opportunities?page=1', 'search' => false],
                ['role' => 'COMPANY', 'label' => 'Inicio (indicadores)', 'path' => '/api/dashboard', 'search' => false],
            ]),
            ...array_map(fn (array $item) => [...$item, 'role' => 'SECRETARY', 'email' => $secretary], [
                ['label' => 'Empresas, página 1', 'path' => '/api/companies?page=1', 'search' => false],
                ['label' => 'Empresas, búsqueda', 'path' => '/api/companies?q=grupo', 'search' => false],
                ['label' => 'Reporte ejecutivo', 'path' => '/api/reports/dual-program', 'search' => false],
                ['label' => 'Exportación CSV del reporte', 'path' => '/api/reports/dual-program/export.csv', 'search' => false],
                ['label' => 'Inicio (indicadores)', 'path' => '/api/dashboard', 'search' => false],
            ]),
            ...array_map(fn (array $item) => [...$item, 'role' => 'ADMIN', 'email' => $admin], [
                ['label' => 'Instituciones', 'path' => '/api/institutions', 'search' => false],
                ['label' => 'Bitácora, página 1', 'path' => '/api/audit-events?page=1', 'search' => false],
                ['label' => "Bitácora, última página ({$auditPages})", 'path' => "/api/audit-events?page={$auditPages}", 'search' => false],
                ['label' => 'Bitácora filtrada (solicitudes)', 'path' => '/api/audit-events?type=linkage_requested&page=1', 'search' => false],
                ['label' => 'Inicio (indicadores)', 'path' => '/api/dashboard', 'search' => false],
                ['label' => 'Reporte ejecutivo', 'path' => '/api/reports/dual-program', 'search' => false],
            ]),
        ];
    }

    private static function auditEvents(): int
    {
        return DB::table('users')->whereNotNull('created_by')->count()
            + DB::table('companies')->count()
            + DB::table('opportunities')->count()
            + DB::table('linkage_requests')->count()
            + DB::table('linkage_requests')->whereNotNull('responded_by')->count();
    }
}
