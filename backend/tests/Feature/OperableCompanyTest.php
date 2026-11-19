<?php

use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S14-03 CA-05 (M1): publicar oportunidades y enviar solicitudes exige el nombre visible de la empresa y el nombre y
// correo de su contacto; el puesto y el teléfono son opcionales. Explorar el talento queda libre.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->company = Company::factory()->invited()->create();
    $this->account = User::factory()->forCompany($this->company)->create();
    $this->institution = Institution::factory()->create();
});

function operableOpportunityPayload(): array
{
    return [
        'title' => 'Automatización de línea de ensamble', 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 3, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032',
        'description' => 'Apoyo en la programación de PLC.', 'skills' => [['name' => 'PLC', 'kind' => 'technical']],
    ];
}

function operableStudent(Institution $institution): Student
{
    $student = Student::factory()->for($institution)->withIdentity()->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false,
    ]);
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    return $student->fresh();
}

function operableOpportunity(Company $company, bool $active = true): Opportunity
{
    $opportunity = new Opportunity([
        'title' => 'Automatización', 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 3, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->is_active = $active;
    $opportunity->save();

    return $opportunity->refresh();
}

function expectProfileIncomplete($response, array $missing): void
{
    $response->assertUnprocessable()->assertHeader('Cache-Control', 'no-store, private')->assertExactJson([
        'message' => 'Completa el nombre de tu empresa y el nombre y correo del contacto en Mi cuenta para publicar oportunidades y enviar solicitudes.',
        'code' => 'COMPANY_PROFILE_INCOMPLETE',
        'missing' => $missing,
    ]);
}

it('blocks publishing an opportunity until the minimum is complete, listing what is missing', function () {
    $this->loginWithCookies($this->account)->assertOk();
    expectProfileIncomplete($this->browserRequest('POST', '/api/opportunities', operableOpportunityPayload()), ['name', 'contact_name', 'contact_email']);

    $this->browserRequest('PUT', '/api/organization/profile', ['trade_name' => 'Taller Norteño', 'contact_name' => 'Lucía'])->assertOk();
    expectProfileIncomplete($this->browserRequest('POST', '/api/opportunities', operableOpportunityPayload()), ['contact_email']);
    expect(Opportunity::query()->count())->toBe(0);

    // El resto del perfil (puesto, teléfono, datos fiscales, sector, ubicación) no es necesario para operar.
    $this->browserRequest('PUT', '/api/organization/profile', ['contact_email' => 'l@norteno.test'])->assertOk()->assertJsonPath('data.can_operate', true);
    $this->browserRequest('GET', '/api/me')->assertJsonPath('user.company.can_operate', true);
    $this->browserRequest('POST', '/api/opportunities', operableOpportunityPayload())->assertCreated();
});

it('blocks editing and reactivating an opportunity, but always allows inactivating it', function () {
    $active = operableOpportunity($this->company);
    $inactive = operableOpportunity($this->company, active: false);
    $this->loginWithCookies($this->account)->assertOk();

    expectProfileIncomplete($this->browserRequest('PUT', "/api/opportunities/{$active->id}", operableOpportunityPayload()), ['name', 'contact_name', 'contact_email']);
    expectProfileIncomplete($this->browserRequest('PATCH', "/api/opportunities/{$inactive->id}/status", ['is_active' => true]), ['name', 'contact_name', 'contact_email']);
    expect($inactive->refresh()->is_active)->toBeFalse()->and($active->refresh()->title)->toBe('Automatización');

    $this->browserRequest('PATCH', "/api/opportunities/{$active->id}/status", ['is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
});

it('blocks sending a linkage request until the minimum is complete, while talent stays explorable', function () {
    $student = operableStudent($this->institution);
    $opportunity = operableOpportunity($this->company);
    $this->loginWithCookies($this->account)->assertOk();

    $this->browserRequest('GET', '/api/talent')->assertOk();
    $this->browserRequest('GET', "/api/talent/{$student->public_id}")->assertOk();
    $request = ['student_public_id' => $student->public_id, 'opportunity_id' => $opportunity->id, 'message' => 'Nos interesa su perfil.'];
    expectProfileIncomplete($this->browserRequest('POST', '/api/linkage-requests', $request), ['name', 'contact_name', 'contact_email']);
    expect(LinkageRequest::query()->count())->toBe(0);

    $this->browserRequest('PUT', '/api/organization/profile', [
        'legal_name' => 'Taller Norteño, S.A.', 'contact_name' => 'Lucía', 'contact_position' => 'Recursos Humanos', 'contact_email' => 'l@norteno.test',
    ])->assertOk();
    $this->browserRequest('POST', '/api/linkage-requests', $request)->assertCreated();

    // La institución ve el nombre y el contacto de quien la busca.
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();
    $id = LinkageRequest::query()->sole()->id;
    $this->browserRequest('GET', "/api/institution/linkage-requests/{$id}")->assertOk()
        ->assertJsonPath('data.company.name', 'Taller Norteño, S.A.')->assertJsonPath('data.company.contact_position', 'Recursos Humanos')
        ->assertJsonPath('data.company.contact_email', 'l@norteno.test');
});
