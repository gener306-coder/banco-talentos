<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S7-01: reporte ejecutivo del programa de Educación Dual.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

/** Alumno de la institución; con $searchable, su expediente público completo y el punto de la cabecera de Reynosa. */
function reportStudent(Institution $institution, bool $searchable = true, array $values = []): Student
{
    $student = Student::factory()->for($institution)->withIdentity()->create();
    $profile = $searchable ? [
        'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false,
    ] : [];
    if ($columns = array_replace($profile, $values)) {
        DB::table('students')->where('id', $student->id)->update($columns);
    }
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    return $student->fresh();
}

function reportOpportunity(Company $company, bool $active = true): Opportunity
{
    $opportunity = new Opportunity([
        'title' => 'Tableros de producción', 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->is_active = $active;
    $opportunity->save();

    return $opportunity;
}

/** Solicitud en el estado indicado, con su propia oportunidad (inactiva para no alterar los conteos de oportunidades). */
function reportLinkage(Company $company, Student $student, string $status = 'PENDIENTE_INSTITUCION'): LinkageRequest
{
    $linkage = new LinkageRequest;
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = reportOpportunity($company, active: false)->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = User::factory()->forCompany($company)->create()->id;
    $linkage->status = $status;
    $linkage->save();

    return $linkage;
}

function dualProgramReport($test)
{
    return $test->browserRequest('GET', '/api/reports/dual-program');
}

function reportViewer(UserRole $role = UserRole::ADMIN): User
{
    return User::factory()->role($role)->create();
}

it('rejects visitors (CA-01)', function () {
    dualProgramReport($this)->assertUnauthorized();
});

it('allows only ADMIN and SECRETARY (CA-01)', function (UserRole $role, int $status) {
    $user = match ($role) {
        UserRole::INSTITUTION => User::factory()->forInstitution(Institution::factory()->create())->create(),
        UserRole::COMPANY => User::factory()->forCompany()->create(),
        default => reportViewer($role),
    };
    $this->loginWithCookies($user)->assertOk();

    dualProgramReport($this)->assertStatus($status);
})->with([
    'ADMIN' => [UserRole::ADMIN, 200],
    'SECRETARY' => [UserRole::SECRETARY, 200],
    'INSTITUTION' => [UserRole::INSTITUTION, 403],
    'COMPANY' => [UserRole::COMPANY, 403],
]);

it('rejects an account deactivated after logging in (CA-01)', function () {
    $user = reportViewer(UserRole::SECRETARY);
    $this->loginWithCookies($user)->assertOk();
    $user->forceFill(['is_active' => false])->save();

    dualProgramReport($this)->assertUnauthorized();
});

it('returns zero counts and empty lists without data (CA-02)', function () {
    $this->loginWithCookies(reportViewer())->assertOk();

    $response = dualProgramReport($this)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    expect($response->json('data.linkage_summary'))->toBe(['total' => 0, 'by_status' => [
        'PENDIENTE_INSTITUCION' => 0, 'ACEPTADA' => 0, 'RECHAZADA' => 0, 'CANCELADA' => 0,
    ]])
        ->and($response->json('data.by_institution'))->toBe([])
        ->and($response->json('data.by_sector'))->toBe([])
        ->and($response->json('data.generated_at'))->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/');
});

it('aggregates linkage requests, institutions and SCIAN sectors (CA-02)', function (UserRole $role) {
    $manufacturing = Company::factory()->create(['sector_code' => '31-33']);
    $otherManufacturing = Company::factory()->create(['sector_code' => '31-33']);
    $professional = Company::factory()->create(['sector_code' => '54']);
    // Sector con una empresa inactiva: aparece con cero empresas activas.
    $inactiveCompany = Company::factory()->create(['sector_code' => '11']);

    $tech = Institution::factory()->create(['name' => 'Universidad Tecnológica']);
    $agro = Institution::factory()->create(['name' => 'Instituto Agropecuario']);
    $closed = Institution::factory()->inactive()->create(['name' => 'Bachillerato Cerrado']);

    $student = reportStudent($tech);
    reportStudent($tech);
    reportStudent($tech, false);
    reportStudent($tech, true, ['is_active' => false]);
    $agroStudent = reportStudent($agro, true, ['program' => null]);
    reportStudent($closed);

    reportLinkage($manufacturing, $student);
    reportLinkage($manufacturing, $student, 'ACEPTADA');
    reportLinkage($otherManufacturing, $student, 'ACEPTADA');
    reportLinkage($professional, $agroStudent, 'ACEPTADA');
    reportLinkage($professional, $agroStudent, 'RECHAZADA');
    reportLinkage($inactiveCompany, $student, 'CANCELADA');

    reportOpportunity($manufacturing);
    reportOpportunity($manufacturing);
    reportOpportunity($professional);
    // Activa, pero de una empresa inactiva: fuera de las oportunidades activas.
    reportOpportunity($inactiveCompany);
    $inactiveCompany->forceFill(['is_active' => false])->save();

    $this->loginWithCookies(reportViewer($role))->assertOk();
    $data = dualProgramReport($this)->assertOk()->json('data');

    expect($data['linkage_summary'])->toBe(['total' => 6, 'by_status' => [
        'PENDIENTE_INSTITUCION' => 1, 'ACEPTADA' => 3, 'RECHAZADA' => 1, 'CANCELADA' => 1,
    ]]);
    expect($data['by_institution'])->toBe([
        ['id' => $closed->id, 'name' => 'Bachillerato Cerrado', 'is_active' => false, 'active_students' => 1, 'searchable_profiles' => 1, 'received_requests' => 0, 'accepted_requests' => 0],
        ['id' => $agro->id, 'name' => 'Instituto Agropecuario', 'is_active' => true, 'active_students' => 1, 'searchable_profiles' => 0, 'received_requests' => 2, 'accepted_requests' => 1],
        ['id' => $tech->id, 'name' => 'Universidad Tecnológica', 'is_active' => true, 'active_students' => 3, 'searchable_profiles' => 2, 'received_requests' => 4, 'accepted_requests' => 2],
    ]);
    expect($data['by_sector'])->toBe([
        ['sector_code' => '11', 'active_companies' => 0, 'active_opportunities' => 0, 'accepted_requests' => 0],
        ['sector_code' => '31-33', 'active_companies' => 2, 'active_opportunities' => 2, 'accepted_requests' => 2],
        ['sector_code' => '54', 'active_companies' => 1, 'active_opportunities' => 1, 'accepted_requests' => 1],
    ]);
})->with([UserRole::ADMIN, UserRole::SECRETARY]);

it('matches the searchable universe of the dashboard (CA-02)', function () {
    $institution = Institution::factory()->create();
    reportStudent($institution);
    reportStudent($institution, true, ['state_code' => null, 'municipality_code' => null]);
    reportStudent($institution, true, ['dual_available' => null]);
    $this->loginWithCookies(User::factory()->forInstitution($institution)->create())->assertOk();
    $dashboard = $this->browserRequest('GET', '/api/dashboard')->assertOk()->json('data.metrics.searchable_students');
    $this->browserRequest('POST', '/api/logout');

    $this->loginWithCookies(reportViewer())->assertOk();
    expect(dualProgramReport($this)->assertOk()->json('data.by_institution.0.searchable_profiles'))->toBe($dashboard)->toBe(1);
});

it('never exposes student, account or location data (CA-02)', function () {
    $institution = Institution::factory()->create(['name' => 'Universidad Tecnológica', 'contact_email' => 'dual@ut.edu.mx']);
    $student = reportStudent($institution);
    $student->identity->forceFill(['enrollment_number' => 'MAT2026X', 'given_names' => 'Ximena', 'first_surname' => 'Zaragoza'])->save();
    $company = Company::factory()->create();
    reportLinkage($company, $student, 'ACEPTADA');
    $this->loginWithCookies(reportViewer())->assertOk();

    $queries = [];
    DB::listen(function ($query) use (&$queries) {
        $queries[] = $query->sql;
    });
    $body = dualProgramReport($this)->assertOk()->getContent();
    $sql = implode("\n", $queries);

    foreach (['MAT2026X', 'Ximena', 'Zaragoza', $student->public_id,
        'dual@ut.edu.mx', $company->legal_name, $company->rfc, 'location', 'student_id', 'public_id', 'email'] as $secret) {
        expect($body)->not->toContain((string) $secret);
    }
    expect($sql)->not->toContain('student_identities')
        ->and($sql)->not->toContain('student_social_security')
        ->and($sql)->not->toContain('ST_');
    expect(array_keys(dualProgramReport($this)->json('data.by_institution.0')))
        ->toBe(['id', 'name', 'is_active', 'active_students', 'searchable_profiles', 'received_requests', 'accepted_requests']);
});

it('reads the students and linkage requests tables once, whatever the number of institutions (T-S8-01)', function (int $institutions) {
    foreach (range(1, $institutions) as $n) {
        $institution = Institution::factory()->create();
        reportStudent($institution);
        reportStudent($institution, false);
    }
    $this->loginWithCookies(reportViewer())->assertOk();

    $queries = [];
    DB::listen(function ($query) use (&$queries) {
        $queries[] = $query->sql;
    });
    $rows = dualProgramReport($this)->assertOk()->json('data.by_institution');

    expect($rows)->toHaveCount($institutions)
        ->and(collect($rows)->every(fn (array $row) => $row['active_students'] === 2 && $row['searchable_profiles'] === 1))->toBeTrue()
        ->and(collect($queries)->filter(fn (string $sql) => str_contains($sql, 'from "students"'))->count())->toBe(1)
        ->and(collect($queries)->filter(fn (string $sql) => preg_match('/from "linkage_requests"(?! inner join)/', $sql))->count())->toBe(2);
})->with([1, 12]);
