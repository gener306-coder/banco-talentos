<?php

use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support\InteractsWithCookieSessions;

// HU-S14-02: perfil de la organización de la sesión, sector SCIAN de un solo establecimiento (D2) y aviso D7.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    Notification::fake();
    $this->company = Company::factory()->create(['legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'trade_name' => 'ManuGolfo', 'sector_code' => null]);
    $this->companyAccount = User::factory()->forCompany($this->company)->create();
    $this->institution = Institution::factory()->create(['name' => 'Universidad Tecnológica del Golfo', 'cct' => '28EUT0001A', 'contact_name' => 'Laura Méndez']);
    $this->institutionAccount = User::factory()->forInstitution($this->institution)->create();
});

function companyProfile(array $changes = []): array
{
    return array_replace([
        'trade_name' => 'ManuGolfo', 'state_code' => '28', 'municipality_code' => '28041',
        'contact_name' => 'Lucía Herrera', 'contact_position' => 'Recursos Humanos', 'contact_email' => 'dual@manugolfo.test', 'contact_phone' => '8331234567',
    ], $changes);
}

/** Solicitud aceptada entre la empresa y la institución, para ver el nombre nuevo del otro lado. */
function profileLinkage(Company $company, Institution $institution): LinkageRequest
{
    $student = Student::factory()->for($institution)->withIdentity()->create();
    $opportunity = new Opportunity([
        'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $institution->id;
    $linkage->requested_by = $opportunity->created_by;
    $linkage->status = 'ACEPTADA';
    $linkage->responded_by = User::factory()->forInstitution($institution)->create()->id;
    $linkage->responded_at = now();
    $linkage->save();

    return $linkage;
}

function institutionProfile(array $changes = []): array
{
    return array_replace(['contact_name' => 'Laura Méndez', 'contact_position' => 'Coordinación Dual', 'contact_email' => 'dual@ut.test', 'contact_phone' => null], $changes);
}

describe('acceso y aislamiento', function () {
    it('only serves companies and institutions, with no-store', function (UserRole $role) {
        $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
        $this->browserRequest('GET', '/api/organization/profile')->assertForbidden();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile())->assertForbidden();
    })->with([UserRole::ADMIN, UserRole::SECRETARY]);

    it('rejects visitors and requests without CSRF', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', '/api/organization/profile')->assertUnauthorized();
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(), csrf: false)->assertStatus(419);
    });

    it('shows the session company with an explicit list of fields', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('GET', '/api/organization/profile')->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => [
                'type' => 'company', 'name' => 'ManuGolfo', 'legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'rfc' => $this->company->rfc,
                'sector_code' => null, 'trade_name' => 'ManuGolfo', 'state_code' => '28', 'municipality_code' => '28041',
                'municipality' => $this->company->municipality->name, 'contact_name' => 'Responsable del programa dual',
                'contact_position' => null, 'contact_email' => 'dual@empresa.test', 'contact_phone' => null,
            ]]);
    });

    it('never edits another organization: ids in the body are rejected and the session one is used', function () {
        $other = Company::factory()->create(['trade_name' => 'Ajena']);
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['id' => $other->id, 'company_id' => $other->id]))
            ->assertUnprocessable()->assertJsonValidationErrors(['id', 'company_id']);
        // Tampoco en la query string: cualquier id se rechaza; la organización es siempre la de la sesión.
        $this->browserRequest('PUT', '/api/organization/profile?company_id='.$other->id, companyProfile(['trade_name' => 'Propia']))
            ->assertUnprocessable()->assertJsonValidationErrors(['company_id']);
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['trade_name' => 'Propia']))->assertOk()
            ->assertJsonPath('data.trade_name', 'Propia');
        expect($other->refresh()->trade_name)->toBe('Ajena')->and($this->company->refresh()->trade_name)->toBe('Propia');
    });
});

describe('campos permitidos', function () {
    it('rejects the company legal data, status and anything outside its list by name', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile([
            'legal_name' => 'Otra, S.A.', 'rfc' => 'XAXX010101000', 'is_active' => false, 'validation_reference' => 'X', 'registered_by' => 1,
        ]))->assertUnprocessable()->assertJsonValidationErrors(['legal_name', 'rfc', 'is_active', 'validation_reference', 'registered_by']);
        expect($this->company->refresh()->legal_name)->toBe('Manufacturas del Golfo, S.A. de C.V.');
    });

    it('lets the institution change only its program contact, never its official name or CCT', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['name' => 'Otra', 'cct' => 'X', 'trade_name' => 'X', 'sector_code' => '54']))
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'cct', 'trade_name', 'sector_code']);

        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile())->assertOk()
            ->assertExactJson(['data' => [
                'type' => 'institution', 'name' => 'Universidad Tecnológica del Golfo', 'cct' => '28EUT0001A',
                'contact_name' => 'Laura Méndez', 'contact_position' => 'Coordinación Dual', 'contact_email' => 'dual@ut.test', 'contact_phone' => null,
            ]]);
    });

    it('validates the editable fields', function (array $changes, string $field) {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile($changes))->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([
        'correo' => [['contact_email' => 'no-es-correo'], 'contact_email'],
        'contacto vacío' => [['contact_name' => '  '], 'contact_name'],
        'teléfono' => [['contact_phone' => 'abc'], 'contact_phone'],
        'municipio de otro estado' => [['state_code' => '19'], 'municipality_code'],
        'nombre comercial largo' => [['trade_name' => str_repeat('a', 151)], 'trade_name'],
        'sector fuera del catálogo' => [['sector_code' => '99'], 'sector_code'],
    ]);
});

describe('sector SCIAN de un solo establecimiento (D2)', function () {
    it('lets the company set its sector once and then locks it', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => '31-33']))->assertOk()->assertJsonPath('data.sector_code', '31-33');
        $event = AccountAuditEvent::query()->sole();
        expect($event->changed_fields)->toContain('sector_code');

        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => '54']))->assertUnprocessable()
            ->assertJsonValidationErrors(['sector_code' => 'El sector ya está establecido. Para cambiarlo, escribe a la Secretaría de Economía.']);
        // Reenviar el mismo sector no es un cambio.
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => '31-33']))->assertOk();
        expect($this->company->refresh()->sector_code->value)->toBe('31-33');
    });

    it('keeps the secretary able to assign or correct it, and the sector optional in its form', function () {
        $secretary = User::factory()->role(UserRole::SECRETARY)->create();
        $this->loginWithCookies($secretary)->assertOk();
        $this->company->update(['sector_code' => '54']);
        $detail = $this->browserRequest('GET', "/api/companies/{$this->company->id}")->assertOk()->json('data');
        $payload = collect($detail)->only(['legal_name', 'trade_name', 'rfc', 'state_code', 'municipality_code', 'contact_name', 'contact_position', 'contact_email', 'contact_phone', 'validation_reference'])->all();

        $this->browserRequest('PUT', "/api/companies/{$this->company->id}", [...$payload, 'sector_code' => '31-33'])->assertOk()->assertJsonPath('data.sector_code', '31-33');
        $this->browserRequest('PUT', "/api/companies/{$this->company->id}", [...$payload, 'sector_code' => null])->assertOk()->assertJsonPath('data.sector_code', null);
    });

    it('announces the missing sector in the session until it is set', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk()->assertJsonPath('user.company.missing', ['contact_position', 'sector_code']);
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => '54']))->assertOk();
        // Ese guardado también captura el puesto del contacto: el perfil queda completo.
        $this->browserRequest('GET', '/api/me')->assertJsonPath('user.company.missing', []);
    });

    it('groups companies without sector in the executive report without losing them in the totals', function () {
        Company::factory()->create(['sector_code' => '54']);
        $this->loginWithCookies(User::factory()->role(UserRole::SECRETARY)->create())->assertOk();
        $sectors = $this->browserRequest('GET', '/api/reports/dual-program')->assertOk()->json('data.by_sector');
        $last = end($sectors);
        expect($last['sector_code'])->toBeNull()
            ->and($last['active_companies'])->toBe(Company::query()->whereNull('sector_code')->where('is_active', true)->count())
            ->and(array_sum(array_column($sectors, 'active_companies')))->toBe(Company::query()->where('is_active', true)->count());
        $csv = $this->browserRequest('GET', '/api/reports/dual-program/export.csv')->assertOk()->streamedContent();
        expect($csv)->toContain('Sin sector asignado');
    });
});

describe('sin aviso a la Secretaría (M2) y bitácora', function () {
    it('never emails the secretary when the trade name changes: the audit log records it (M2)', function () {
        User::factory()->role(UserRole::SECRETARY)->create();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['trade_name' => 'Golfo Industrial']))->assertOk();
        Notification::assertNothingSent();
        expect(AccountAuditEvent::query()->sole()->changed_fields)->toContain('trade_name');
    });

    it('records only the names of the fields that changed, never their values, and nothing when nothing changed', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile())->assertOk();
        $first = AccountAuditEvent::query()->sole();
        expect([$first->event, $first->subject_type, $first->subject_id, $first->actor_id])
            ->toBe(['organization_profile_updated', 'company', $this->company->id, $this->companyAccount->id])
            ->and($first->changed_fields)->toEqualCanonicalizing(['contact_name', 'contact_position', 'contact_email', 'contact_phone']);
        expect(json_encode(DB::table('account_audit_events')->get()))->not->toContain('dual@manugolfo.test')->not->toContain('Lucía');

        $this->browserRequest('PUT', '/api/organization/profile', companyProfile())->assertOk();
        expect(AccountAuditEvent::query()->count())->toBe(1);
    });

    it('reflects the new data in what the other side consumes and in the session identity', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['trade_name' => 'Golfo Industrial']))->assertOk()->assertJsonPath('data.name', 'Golfo Industrial');
        $this->browserRequest('GET', '/api/me')->assertJsonPath('user.company.name', 'Golfo Industrial');

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['contact_email' => 'nuevo@ut.test']))->assertOk();
        expect($this->institution->refresh()->contact_email)->toBe('nuevo@ut.test');
    });

    it('shows the new trade name to the institution in its inbox and the conversation', function () {
        $linkage = profileLinkage($this->company, $this->institution);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['trade_name' => 'Golfo Industrial']))->assertOk();

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        expect($this->browserRequest('GET', '/api/institution/linkage-requests')->assertOk()->json('data.0.company.name'))->toBe('Golfo Industrial');
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('POST', "/api/linkage-requests/{$linkage->id}/messages", ['body' => 'Hola'])->assertCreated();
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        expect($this->browserRequest('GET', "/api/institution/linkage-requests/{$linkage->id}/messages")->assertOk()->json('data.0.sender_name'))->toBe('Golfo Industrial');
    });

    it('limits profile requests per account', function () {
        RateLimiter::clear('organization-profile:'.$this->institutionAccount->id);
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        foreach (range(1, 10) as $attempt) {
            $this->browserRequest('GET', '/api/organization/profile')->assertOk();
        }
        $this->browserRequest('GET', '/api/organization/profile')->assertTooManyRequests();
    });
});
