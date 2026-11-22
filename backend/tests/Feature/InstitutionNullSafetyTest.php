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

// HU-S16-05: instituciones con nombre, CCT o contacto pendientes, sin errores en ningún consumidor.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

/** Institución invitada que aún no captura su perfil. */
function unnamedInstitution(): Institution
{
    return Institution::factory()->invited()->create();
}

/** Solicitud aceptada de una empresa a un alumno de la institución, con su oportunidad. */
function unnamedLinkage(Institution $institution, Company $company, User $companyAccount): LinkageRequest
{
    $student = Student::factory()->for($institution)->withIdentity(['given_names' => 'Ana', 'first_surname' => 'Ruiz'])->create();
    $opportunity = new Opportunity(['title' => 'Prácticas', 'program' => 'Datos', 'period_number' => 3, 'vacancies' => 2, 'can_relocate' => false,
        'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.']);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = $companyAccount->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();
    $linkage = new LinkageRequest(['message' => 'Hola.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $institution->id;
    $linkage->requested_by = $companyAccount->id;
    $linkage->status = 'ACEPTADA';
    $linkage->save();

    return $linkage;
}

it('label() y displayName() distinguen el nombre pendiente; missing() y profileStatus() cuentan los 4 datos mínimos', function () {
    $institution = unnamedInstitution();

    expect($institution->displayName())->toBeNull()
        ->and($institution->label())->toBe('Institución sin nombre')
        ->and($institution->missing())->toBe(['name', 'cct', 'contact_name', 'contact_email'])
        ->and($institution->profileStatus(accessed: false))->toBe('pending_access')
        ->and($institution->profileStatus(accessed: true))->toBe('incomplete')
        ->and(Institution::factory()->create()->profileStatus(accessed: true))->toBe('complete');
});

it('/api/me devuelve el nombre de la institución en null mientras no lo captura', function () {
    $account = User::factory()->forInstitution(unnamedInstitution())->create();

    $this->loginWithCookies($account)->assertOk()->assertJsonPath('user.institution.name', null);
});

it('la bandeja de la empresa y el resumen de mensajes usan Institución sin nombre, sin errores', function () {
    $company = Company::factory()->create();
    $companyAccount = User::factory()->forCompany($company)->create();
    $linkage = unnamedLinkage(unnamedInstitution(), $company, $companyAccount);
    $this->loginWithCookies($companyAccount)->assertOk();

    $this->browserRequest('GET', '/api/linkage-requests')->assertOk()
        ->assertJsonPath('data.0.institution.name', 'Institución sin nombre')
        ->assertJsonPath('data.0.institution.contact_email', null);
    $this->browserRequest('GET', "/api/linkage-requests/{$linkage->id}/messages")->assertOk();
});

it('el reporte ejecutivo y la bitácora nombran a la institución invitada sin errores', function () {
    unnamedInstitution();
    Institution::factory()->create(['name' => 'Alfa']);
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $institutions = collect($this->browserRequest('GET', '/api/reports/dual-program')->assertOk()->json('data.by_institution'));
    expect($institutions->pluck('name')->all())->toBe(['Alfa', 'Institución sin nombre']);
    $this->browserRequest('GET', '/api/reports/dual-program/export.csv')->assertOk();
});

it('el listado de Administración busca por nombre, CCT y correo de la cuenta, de forma literal (CA-04)', function () {
    $alfa = Institution::factory()->create(['name' => 'Universidad Alfa', 'cct' => '28DIT0001A']);
    $beta = Institution::factory()->create(['name' => 'Instituto Beta', 'cct' => '09DIT0002B']);
    $invited = unnamedInstitution();
    User::factory()->forInstitution($invited)->create(['email' => 'coordinacion@invitada.test']);
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $ids = fn (string $q) => collect($this->browserRequest('GET', '/api/institutions?q='.urlencode($q))->assertOk()->json('data'))->pluck('id')->all();

    expect($ids('alfa'))->toBe([$alfa->id])
        ->and($ids('09dit'))->toBe([$beta->id])
        ->and($ids('invitada.test'))->toBe([$invited->id])
        ->and($ids('%'))->toBe([])
        ->and($ids(''))->toHaveCount(3);
    $this->browserRequest('GET', '/api/institutions?q='.str_repeat('a', 201))->assertUnprocessable()->assertJsonValidationErrors('q');
});
