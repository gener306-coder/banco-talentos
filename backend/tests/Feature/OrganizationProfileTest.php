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

// HU-S14-02 y HU-S14-03: perfil de la organización de la sesión; la empresa captura todo su perfil, su onboarding termina
// al guardarlo o posponerlo y la institución solo mantiene el contacto de su programa dual.
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
        'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'period_number' => 5,
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
                'missing' => ['sector_code'], 'can_operate' => true,
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
    it('lets the company capture its legal data and rejects internal fields and ids by name (HU-S14-03 CA-01)', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile([
            'is_active' => false, 'validation_reference' => 'X', 'registered_by' => 1, 'onboarding_dismissed_at' => null, 'location' => 'POINT(0 0)',
        ]))->assertUnprocessable()->assertJsonValidationErrors(['is_active', 'validation_reference', 'registered_by', 'onboarding_dismissed_at', 'location']);

        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['legal_name' => 'Golfo Industrial, S.A. de C.V.', 'rfc' => ' gin150320ab1 ']))->assertOk()
            ->assertJsonPath('data.legal_name', 'Golfo Industrial, S.A. de C.V.')->assertJsonPath('data.rfc', 'GIN150320AB1');
    });

    it('saves a partial profile: blanks become null, the location can be cleared and nothing is required', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', [
            'trade_name' => '  ', 'legal_name' => '', 'rfc' => '', 'sector_code' => '', 'state_code' => '', 'municipality_code' => '',
            'contact_name' => '', 'contact_position' => null, 'contact_email' => ' ', 'contact_phone' => '',
        ])->assertOk()
            ->assertJsonPath('data.name', null)->assertJsonPath('data.rfc', null)->assertJsonPath('data.state_code', null)->assertJsonPath('data.can_operate', false)
            ->assertJsonPath('data.missing', ['name', 'contact_name', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location']);
        expect(DB::table('companies')->where('id', $this->company->id)->value('location'))->toBeNull();
        // Un cuerpo vacío no cambia nada.
        $this->browserRequest('PUT', '/api/organization/profile', [])->assertOk();
    });

    it('lets the institution change its program contact without touching its official data, and never company data', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['trade_name' => 'X', 'sector_code' => '54']))
            ->assertUnprocessable()->assertJsonValidationErrors(['trade_name', 'sector_code']);

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
        'teléfono' => [['contact_phone' => 'abc'], 'contact_phone'],
        'municipio de otro estado' => [['state_code' => '19'], 'municipality_code'],
        'estado sin municipio' => [['municipality_code' => ''], 'municipality_code'],
        'municipio sin estado' => [['state_code' => null], 'state_code'],
        'nombre comercial largo' => [['trade_name' => str_repeat('a', 151)], 'trade_name'],
        'razón social larga' => [['legal_name' => str_repeat('a', 201)], 'legal_name'],
        'RFC genérico' => [['rfc' => 'XAXX010101000'], 'rfc'],
        'sector fuera del catálogo' => [['sector_code' => '99'], 'sector_code'],
        'nombre de la cuenta largo' => [['account_name' => str_repeat('n', 121)], 'account_name'],
    ]);

    it('rejects an RFC that already belongs to another company but keeps its own', function () {
        Company::factory()->create(['rfc' => 'OTR010101AA1']);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['rfc' => 'otr010101aa1']))->assertUnprocessable()
            ->assertJsonValidationErrors(['rfc' => 'Ya existe una empresa registrada con ese RFC.']);
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['rfc' => $this->company->rfc]))->assertOk();
    });
});

describe('perfil autogestionado y onboarding (HU-S14-03)', function () {
    it('lets the company change its sector as often as it needs (replaces D2)', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => '31-33']))->assertOk()->assertJsonPath('data.sector_code', '31-33');
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => '54']))->assertOk()->assertJsonPath('data.sector_code', '54');
        $this->browserRequest('PUT', '/api/organization/profile', companyProfile(['sector_code' => null]))->assertOk()->assertJsonPath('data.sector_code', null);
        expect(AccountAuditEvent::query()->pluck('changed_fields')->every(fn (array $fields) => in_array('sector_code', $fields, true)))->toBeTrue();
    });

    it('updates the account name with the contact only when it really changes, and keeps it on a blank value', function () {
        $account = User::factory()->forCompany(Company::factory()->invited()->create())->create(['email' => 'op@invitada.test', 'name' => 'op@invitada.test']);
        $this->loginWithCookies($account)->assertOk();

        $this->browserRequest('PUT', '/api/organization/profile', ['contact_name' => 'Lucía Herrera', 'contact_email' => 'op@invitada.test', 'account_name' => ' Lucía Herrera '])->assertOk();
        expect($account->refresh()->name)->toBe('Lucía Herrera');
        $events = AccountAuditEvent::query()->orderBy('id')->get();
        expect($events->pluck('event')->all())->toBe(['organization_profile_updated', 'account_updated'])
            ->and($events[1]->changed_fields)->toBe(['name'])->and($events[1]->subject_type)->toBe('user');

        foreach (['', null, 'Lucía Herrera'] as $name) {
            $this->browserRequest('PUT', '/api/organization/profile', ['account_name' => $name])->assertOk();
        }
        expect($account->refresh()->name)->toBe('Lucía Herrera')->and(AccountAuditEvent::query()->count())->toBe(2);
        $this->browserRequest('GET', '/api/me')->assertJsonPath('user.name', 'Lucía Herrera');
    });

    it('ignores a stale account_name when the contact name did not change, so a rename is never reverted (T-S14-09)', function () {
        $company = Company::factory()->create(['contact_name' => 'Nombre Anterior', 'contact_email' => 'rh@empresa.test']);
        $account = User::factory()->forCompany($company)->create(['name' => 'Nombre Nuevo', 'email' => 'rh@empresa.test']);
        $this->loginWithCookies($account)->assertOk();

        // Un formulario abierto antes del cambio de nombre guarda otro dato y repite el contacto anterior.
        $this->browserRequest('PUT', '/api/organization/profile', ['contact_name' => 'Nombre Anterior', 'contact_email' => 'rh@empresa.test',
            'contact_phone' => '833 100 2000', 'account_name' => 'Nombre Anterior'])->assertOk();
        expect($account->refresh()->name)->toBe('Nombre Nuevo')
            ->and(AccountAuditEvent::query()->where('event', 'account_updated')->count())->toBe(0);

        // Corregir el nombre del contacto con «Soy yo» sí corrige el de la cuenta.
        $this->browserRequest('PUT', '/api/organization/profile', ['contact_name' => 'Nombre Final', 'contact_email' => 'rh@empresa.test',
            'account_name' => 'Nombre Final'])->assertOk();
        expect($account->refresh()->name)->toBe('Nombre Final');
    });

    it('never lets the institution capture company data', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['legal_name' => 'X', 'rfc' => 'MGO150320AB1']))
            ->assertUnprocessable()->assertJsonValidationErrors(['legal_name', 'rfc']);
        // Su contacto sigue siendo obligatorio, como en HU-S14-02.
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['contact_name' => '']))->assertUnprocessable()->assertJsonValidationErrors(['contact_name']);
    });

    it('starts the onboarding for an invited company and ends it when the profile is saved, even partially', function () {
        $account = User::factory()->forCompany($invited = Company::factory()->invited()->create())->create();
        $this->loginWithCookies($account)->assertOk()
            ->assertJsonPath('user.company.onboarding', 'pending')->assertJsonPath('user.company.can_operate', false);

        $this->browserRequest('PUT', '/api/organization/profile', ['trade_name' => 'Taller Norteño'])->assertOk();
        expect($invited->refresh()->onboarding_dismissed_at)->not->toBeNull();
        $this->browserRequest('GET', '/api/me')->assertJsonPath('user.company.onboarding', 'done')->assertJsonPath('user.company.name', 'Taller Norteño')
            ->assertJsonPath('user.company.can_operate', false);
    });

    it('postpones the onboarding once, without saving data nor recording an event', function () {
        $account = User::factory()->forCompany($invited = Company::factory()->invited()->create())->create();
        $this->loginWithCookies($account)->assertOk();

        $this->browserRequest('POST', '/api/organization/profile/postpone')->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');
        $first = $invited->refresh()->onboarding_dismissed_at;
        $this->travel(5)->minutes();
        $this->browserRequest('POST', '/api/organization/profile/postpone')->assertNoContent();
        expect($invited->refresh()->onboarding_dismissed_at->equalTo($first))->toBeTrue()
            ->and(AccountAuditEvent::query()->count())->toBe(0);
        $this->browserRequest('GET', '/api/me')->assertJsonPath('user.company.onboarding', 'done')->assertJsonPath('user.company.missing.0', 'name');

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('POST', '/api/organization/profile/postpone')->assertForbidden();
        $this->browserRequest('POST', '/api/organization/profile/postpone', csrf: false)->assertStatus(419);
    });

    it('considers the onboarding done when the profile is already complete', function () {
        // El puesto del contacto es opcional: sin él, el perfil ya está completo.
        $complete = Company::factory()->create(['sector_code' => '54']);
        expect($complete->onboarding_dismissed_at)->toBeNull();
        $this->loginWithCookies(User::factory()->forCompany($complete)->create())->assertOk()
            ->assertJsonPath('user.company.onboarding', 'done')->assertJsonPath('user.company.missing', [])->assertJsonPath('user.company.can_operate', true);
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

describe('control de la institución sobre sus datos (T-S14-15)', function () {
    it('lets the institution correct its official name and CCT, normalized, and logs only the changed fields', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        // Primero el contacto de las pruebas, para que el evento siguiente solo registre los datos oficiales.
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile())->assertOk();

        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['name' => '  Universidad Tecnológica de Tamaulipas  ', 'cct' => ' 28eut-0002 b ']))
            ->assertOk()->assertJsonPath('data.name', 'Universidad Tecnológica de Tamaulipas')->assertJsonPath('data.cct', '28EUT0002B');
        expect($this->institution->refresh()->cct)->toBe('28EUT0002B')
            ->and(AccountAuditEvent::query()->orderByDesc('id')->first()->changed_fields)->toBe(['name', 'cct']);
        $this->browserRequest('GET', '/api/me')->assertJsonPath('user.institution.name', 'Universidad Tecnológica de Tamaulipas');
    });

    it('validates the official data: required name, CCT format only when it changes, and CCT uniqueness', function () {
        Institution::factory()->create(['cct' => '28EUT0009Z']);
        DB::table('institutions')->where('id', $this->institution->id)->update(['cct' => 'CLAVE-ANTERIOR']);
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        // Un CCT anterior a la regla sigue siendo válido mientras no cambie.
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['cct' => 'CLAVE-ANTERIOR', 'name' => 'Universidad Tecnológica del Golfo']))->assertOk();
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['cct' => '28EUT01']))
            ->assertUnprocessable()->assertJsonPath('errors.cct.0', \App\Rules\WorkCenterKey::MESSAGE);
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['cct' => '28eut0009z']))
            ->assertUnprocessable()->assertJsonPath('errors.cct.0', 'Esa Clave de Centro de Trabajo ya está registrada en otra institución.');
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['name' => '   ']))->assertUnprocessable()->assertJsonValidationErrors(['name']);
        expect($this->institution->refresh()->cct)->toBe('CLAVE-ANTERIOR');
    });

    it('renames the account with Soy yo only when the contact name changes here, like the company', function () {
        $account = User::factory()->forInstitution($this->institution)->create(['name' => 'Nombre Nuevo', 'email' => 'dual@ut.test']);
        $this->loginWithCookies($account)->assertOk();

        // Copia vieja del formulario: el contacto no cambia y la cuenta conserva su nombre.
        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['account_name' => 'Laura Méndez']))->assertOk();
        expect($account->refresh()->name)->toBe('Nombre Nuevo');

        $this->browserRequest('PUT', '/api/organization/profile', institutionProfile(['contact_name' => 'Laura M. Herrera', 'account_name' => 'Laura M. Herrera']))->assertOk();
        expect($account->refresh()->name)->toBe('Laura M. Herrera')
            ->and(AccountAuditEvent::query()->where('event', 'account_updated')->count())->toBe(1);
    });
});

