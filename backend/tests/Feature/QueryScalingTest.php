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

// Auditoría QA previa a producción: los listados principales no hacen consultas N+1. El número de consultas de una
// página no debe crecer con el número de filas.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->company = Company::factory()->create();
    $this->companyAccount = User::factory()->forCompany($this->company)->create();
    $this->institution = Institution::factory()->create();
    $this->institutionAccount = User::factory()->forInstitution($this->institution)->create();
});

function scalingStudent(Institution $institution): Student
{
    $student = Student::factory()->for($institution)->withIdentity([
        'enrollment_number' => 'MAT-'.strtoupper(bin2hex(random_bytes(4))), 'given_names' => 'Nombre', 'first_surname' => 'Apellido',
    ])->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false, 'headline' => 'Analista de datos',
    ]);
    // Con la ubicación de la cabecera municipal el alumno entra al universo buscable de /talent.
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    return $student->fresh();
}

function scalingOpportunity(Company $company): Opportunity
{
    $opportunity = new Opportunity([
        'title' => 'Oportunidad '.bin2hex(random_bytes(2)), 'program' => 'Ingeniería en Datos', 'period_number' => 5,
        'vacancies' => 10, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();

    return $opportunity->refresh();
}

/** Agrega $count solicitudes, cada una con su propio alumno y su propia oportunidad. */
function scalingLinkages($test, int $count): void
{
    for ($i = 0; $i < $count; $i++) {
        $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
        $linkage->company_id = $test->company->id;
        $linkage->opportunity_id = scalingOpportunity($test->company)->id;
        $linkage->student_id = scalingStudent($test->institution)->id;
        $linkage->institution_id = $test->institution->id;
        $linkage->requested_by = $test->companyAccount->id;
        $linkage->status = 'PENDIENTE_INSTITUCION';
        $linkage->save();
    }
}

/**
 * Consultas que hace una petición GET. Antes se hace una petición de calentamiento: la primera crea las entradas del
 * límite de peticiones en la caché de base de datos (INSERT) y las siguientes solo las actualizan.
 */
function queriesFor($test, string $uri): int
{
    $test->browserRequest('GET', $uri)->assertOk();
    $count = 0;
    DB::listen(function () use (&$count): void {
        $count++;
    });
    $test->browserRequest('GET', $uri)->assertOk();
    $total = $count;
    // DB::listen no se puede quitar: la siguiente medición crea su propio contador.
    $count = PHP_INT_MIN;

    return $total;
}

it('la bandeja de la empresa no crece en consultas con el número de solicitudes', function () {
    scalingLinkages($this, 2);
    $this->loginWithCookies($this->companyAccount)->assertOk();
    $few = queriesFor($this, '/api/linkage-requests');

    scalingLinkages($this, 4);
    $many = queriesFor($this, '/api/linkage-requests');
    expect($this->browserRequest('GET', '/api/linkage-requests')->json('meta.total'))->toBe(6);

    expect($many)->toBe($few);
});

it('la bandeja de la institución no crece en consultas con el número de solicitudes', function () {
    scalingLinkages($this, 2);
    $this->loginWithCookies($this->institutionAccount)->assertOk();
    $few = queriesFor($this, '/api/institution/linkage-requests');

    scalingLinkages($this, 4);
    $many = queriesFor($this, '/api/institution/linkage-requests');
    expect($this->browserRequest('GET', '/api/institution/linkage-requests')->json('meta.total'))->toBe(6);

    expect($many)->toBe($few);
});

it('el padrón de alumnos no crece en consultas con el número de alumnos', function () {
    scalingStudent($this->institution);
    scalingStudent($this->institution);
    $this->loginWithCookies($this->institutionAccount)->assertOk();
    $few = queriesFor($this, '/api/students');

    for ($i = 0; $i < 4; $i++) {
        scalingStudent($this->institution);
    }
    $many = queriesFor($this, '/api/students');
    expect($this->browserRequest('GET', '/api/students')->json('meta.total'))->toBe(6);

    expect($many)->toBe($few);
});

it('la búsqueda de talento no crece en consultas con el número de perfiles', function () {
    scalingLinkages($this, 2);
    $this->loginWithCookies($this->companyAccount)->assertOk();
    $few = queriesFor($this, '/api/talent');

    for ($i = 0; $i < 4; $i++) {
        scalingStudent($this->institution);
    }
    $many = queriesFor($this, '/api/talent');
    // Solo cuentan los perfiles buscables; deben ser más que al medir la primera vez.
    expect($this->browserRequest('GET', '/api/talent')->json('meta.total'))->toBe(6);

    expect($many)->toBe($few);
});

it('el listado de cuentas de Administración no crece en consultas con el número de cuentas (HU-S16-02)', function () {
    $admin = User::factory()->role(UserRole::ADMIN)->create();
    User::factory()->role(UserRole::ADMIN)->create();
    $this->loginWithCookies($admin)->assertOk();
    $few = queriesFor($this, '/api/admin-accounts');

    User::factory()->role(UserRole::ADMIN)->count(4)->create();
    $many = queriesFor($this, '/api/admin-accounts');
    expect($this->browserRequest('GET', '/api/admin-accounts')->json('meta.total'))->toBe(6);

    expect($many)->toBe($few);
});
