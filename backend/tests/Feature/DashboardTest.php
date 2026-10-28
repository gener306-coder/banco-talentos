<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S5-01: indicadores del inicio por rol.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

/** Alumno de la institución; con $searchable, su expediente público completo y el punto de la cabecera de Reynosa. */
function dashboardStudent(Institution $institution, bool $searchable = true, array $values = []): Student
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

/** Alumno con «Municipio por confirmar» (texto libre anterior a HU-S4-04) y sin punto. */
function pendingMunicipalityStudent(Institution $institution, array $values = []): Student
{
    return dashboardStudent($institution, false, array_replace(['state_code' => '28', 'legacy_municipality' => 'Cd. Reynosa'], $values));
}

function secretaryAccount(bool $pending = false, bool $active = true): User
{
    return tap(User::factory()->role(UserRole::SECRETARY)->create(['is_active' => $active]),
        fn (User $user) => $user->forceFill(['password_setup_required' => $pending])->save());
}

function dashboard($test)
{
    return $test->browserRequest('GET', '/api/dashboard');
}

it('rejects visitors (CA-01)', function () {
    dashboard($this)->assertUnauthorized()->assertJsonMissingPath('code');
});

it('rejects an account deactivated after logging in (CA-01)', function () {
    $user = User::factory()->role(UserRole::ADMIN)->create();
    $this->loginWithCookies($user)->assertOk();
    $user->forceFill(['is_active' => false])->save();

    dashboard($this)->assertUnauthorized()->assertJsonMissingPath('code');
});

it('rejects the accounts of an inactive institution (CA-01)', function () {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->forInstitution($institution)->create())->assertOk();
    $institution->forceFill(['is_active' => false])->save();

    dashboard($this)->assertUnauthorized()->assertJsonPath('code', 'INSTITUTION_INACTIVE');
});

it('rejects the accounts of an inactive company (CA-01)', function () {
    $company = Company::factory()->create();
    $this->loginWithCookies(User::factory()->forCompany($company)->create())->assertOk();
    $company->forceFill(['is_active' => false])->save();

    dashboard($this)->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
});

it('sends Cache-Control no-store, private to every role (CA-01)', function (UserRole $role) {
    $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution(Institution::factory()->create())->create() : User::factory()->role($role)->create();
    $this->loginWithCookies($user)->assertOk();

    dashboard($this)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('data.role', $role->value);
})->with(UserRole::cases());

it('counts institutions and secretary accounts for ADMIN (CA-02)', function () {
    Institution::factory()->count(3)->create();
    Institution::factory()->inactive()->count(2)->create();
    secretaryAccount();
    secretaryAccount();
    secretaryAccount(pending: true);
    secretaryAccount(active: false);
    secretaryAccount(pending: true, active: false);
    $admin = User::factory()->role(UserRole::ADMIN)->create();
    $this->loginWithCookies($admin)->assertOk();

    dashboard($this)->assertOk()->assertExactJson(['data' => ['role' => 'ADMIN', 'metrics' => [
        'active_institutions' => 3, 'inactive_institutions' => 2, 'active_secretaries' => 2, 'pending_secretaries' => 1,
    ]]]);
});

it('counts companies and pending secretary accounts for SECRETARY (CA-03)', function () {
    Company::factory()->count(2)->create();
    Company::factory()->count(3)->create(['is_active' => false]);
    secretaryAccount(pending: true);
    secretaryAccount(pending: true);
    secretaryAccount(pending: true, active: false);
    $secretary = secretaryAccount();
    $this->loginWithCookies($secretary)->assertOk();

    dashboard($this)->assertOk()->assertExactJson(['data' => ['role' => 'SECRETARY', 'metrics' => [
        'active_companies' => 2, 'inactive_companies' => 3, 'pending_secretaries' => 2,
    ]]]);
});

it('counts only the students of its own institution for INSTITUTION (CA-04)', function () {
    $institution = Institution::factory()->create();
    dashboardStudent($institution);
    dashboardStudent($institution);
    dashboardStudent($institution, false);
    dashboardStudent($institution, true, ['is_active' => false]);
    dashboardStudent($institution, true, ['program' => null]);
    pendingMunicipalityStudent($institution);
    pendingMunicipalityStudent($institution, ['is_active' => false]);
    // Confirmado: ya tiene clave de municipio aunque conserve el texto anterior.
    dashboardStudent($institution, true, ['legacy_municipality' => 'Reynosa']);

    // Alumnos de otras instituciones (activa e inactiva) con todos los casos: nunca alteran los conteos.
    foreach ([Institution::factory()->create(), Institution::factory()->inactive()->create()] as $other) {
        dashboardStudent($other);
        dashboardStudent($other, false);
        pendingMunicipalityStudent($other);
    }

    $this->loginWithCookies(User::factory()->forInstitution($institution)->create())->assertOk();

    dashboard($this)->assertOk()->assertExactJson(['data' => ['role' => 'INSTITUTION', 'metrics' => [
        'active_students' => 6, 'searchable_students' => 3, 'pending_municipality_students' => 2,
    ]]]);
});

it('returns zero counts to an institution without students even when others have them (CA-04)', function () {
    $other = Institution::factory()->create();
    dashboardStudent($other);
    pendingMunicipalityStudent($other);
    $this->loginWithCookies(User::factory()->forInstitution(Institution::factory()->create())->create())->assertOk();

    dashboard($this)->assertOk()->assertJsonPath('data.metrics', [
        'active_students' => 0, 'searchable_students' => 0, 'pending_municipality_students' => 0,
    ]);
});

it('returns null metrics to an INSTITUTION account without an institution (CA-06)', function () {
    dashboardStudent(Institution::factory()->create());
    $this->loginWithCookies(User::factory()->create(['institution_id' => null]))->assertOk();

    dashboard($this)->assertOk()->assertExactJson(['data' => ['role' => 'INSTITUTION', 'metrics' => null]]);
});

it('counts the talent search universe for COMPANY (CA-05)', function () {
    $institution = Institution::factory()->create();
    dashboardStudent($institution);
    dashboardStudent($institution);
    dashboardStudent(Institution::factory()->create());
    dashboardStudent($institution, true, ['is_active' => false]);
    dashboardStudent($institution, false);
    dashboardStudent($institution, true, ['state_code' => null, 'municipality_code' => null]);
    dashboardStudent(Institution::factory()->inactive()->create());
    pendingMunicipalityStudent($institution);
    $this->loginWithCookies(User::factory()->forCompany()->create())->assertOk();

    $response = dashboard($this)->assertOk()->assertExactJson(['data' => ['role' => 'COMPANY', 'metrics' => [
        'available_talent_profiles' => 3,
    ]]]);

    // Mismo total que el buscador de HU-S4-05.
    expect($this->browserRequest('GET', '/api/talent')->assertOk()->json('meta.total'))
        ->toBe($response->json('data.metrics.available_talent_profiles'));
});
