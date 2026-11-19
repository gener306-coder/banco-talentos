<?php

use App\Enums\EconomicSector;
use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// HU-S4-02: registro y gestión de empresas validadas por la Secretaría de Economía; desde HU-S14-02 el alta es una invitación.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->secretary = User::factory()->role(UserRole::SECRETARY)->create(['name' => 'Analista SE']);
});

function companyPayload(array $overrides = []): array
{
    return array_replace([
        'legal_name' => 'Manufacturas del Golfo, S.A. de C.V.',
        'trade_name' => 'ManuGolfo',
        'rfc' => 'MGO150320AB1',
        'sector_code' => '31-33',
        'state_code' => '28',
        'municipality_code' => '28032',
        'contact_name' => 'Lucía Herrera',
        'contact_position' => 'Recursos Humanos',
        'contact_email' => 'dual@manugolfo.test',
        'contact_phone' => '+52 (899) 123-4567',
        'validation_reference' => 'SE/DGIC/2026/0141',
    ], $overrides);
}

/** [latitud, longitud] guardados de la empresa, redondeados a 4 decimales. */
function companyPoint(int $id): array
{
    $row = DB::selectOne('SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM companies WHERE id = ?', [$id]);

    return [round((float) $row->lat, 4), round((float) $row->lng, 4)];
}

function signInSecretary($test): void
{
    $test->loginWithCookies($test->secretary)->assertOk();
}

/** Invitación mínima de HU-S14-02: solo el correo de la cuenta y, opcionales, los nombres de referencia. */
function invitePayload(array $overrides = []): array
{
    return array_replace(['email' => 'dual@manugolfo.test', 'trade_name' => 'ManuGolfo', 'person_name' => 'Lucía Herrera'], $overrides);
}

describe('invitación (HU-S14-02 CA-01)', function () {
    it('invites a company with only the account email and emails the setup link', function () {
        Notification::fake();
        signInSecretary($this);

        $response = $this->browserRequest('POST', '/api/companies', ['email' => '  DUAL@ManuGolfo.test '])
            ->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('setup_delivery', 'sent')
            ->assertJsonMissingPath('setup_url')
            ->assertJsonPath('data.name', null)
            ->assertJsonPath('data.legal_name', null)
            ->assertJsonPath('data.rfc', null)
            ->assertJsonPath('data.sector_code', null)
            ->assertJsonPath('data.state_code', null)
            ->assertJsonPath('data.municipality', null)
            ->assertJsonPath('data.contact_email', null)
            ->assertJsonPath('data.account_email', 'dual@manugolfo.test')
            ->assertJsonPath('data.profile_status', 'pending_access')
            ->assertJsonPath('data.missing', ['name', 'contact_name', 'contact_position', 'contact_email', 'legal_name', 'rfc', 'sector_code', 'location'])
            ->assertJsonPath('data.registered_by', ['id' => $this->secretary->id, 'name' => 'Analista SE']);

        $company = Company::find($response->json('data.id'));
        expect($company->registered_by)->toBe($this->secretary->id)
            ->and($company->onboarding_dismissed_at)->toBeNull()
            ->and(DB::table('companies')->where('id', $company->id)->value('location'))->toBeNull();
        // M3: sin nombre de la persona, el correo es el nombre provisional de la cuenta.
        $account = User::query()->where('email', 'dual@manugolfo.test')->sole();
        expect($account->role)->toBe(UserRole::COMPANY)
            ->and($account->company_id)->toBe($company->id)
            ->and($account->name)->toBe('dual@manugolfo.test')
            ->and($account->password_setup_required)->toBeTrue()
            ->and($account->created_by)->toBe($this->secretary->id);
        Notification::assertSentTo($account, SetInitialPassword::class);
        Notification::assertCount(1);
        $event = AccountAuditEvent::query()->sole();
        expect([$event->event, $event->subject_type, $event->subject_id, $event->actor_id, $event->changed_fields])
            ->toBe(['company_invited', 'company', $company->id, $this->secretary->id, []]);
    });

    it('keeps the optional reference names: the company name as trade name and the person as the account name', function () {
        Notification::fake();
        signInSecretary($this);

        $id = $this->browserRequest('POST', '/api/companies', invitePayload(['trade_name' => '  ManuGolfo  ']))->assertCreated()
            ->assertJsonPath('data.name', 'ManuGolfo')->assertJsonPath('data.trade_name', 'ManuGolfo')->json('data.id');
        expect(User::query()->where('company_id', $id)->sole()->name)->toBe('Lucía Herrera');
    });

    it('returns the setup link to share instead of emailing it with manual delivery (HU-S2-01)', function () {
        Notification::fake();
        signInSecretary($this);

        $response = $this->browserRequest('POST', '/api/companies', invitePayload(['delivery_method' => 'manual']))
            ->assertCreated()->assertJsonPath('setup_delivery', 'manual')->assertJsonMissingPath('data.delivery_method');

        expect($response->json('setup_url'))->toStartWith(rtrim(config('app.frontend_url'), '/').'/set-initial-password?');
        Notification::assertNothingSent();
    });

    it('validates the invitation without writing anything', function (array $overrides, string $field) {
        Notification::fake();
        signInSecretary($this);

        $this->browserRequest('POST', '/api/companies', invitePayload($overrides))->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('companies', 0);
        $this->assertDatabaseCount('account_audit_events', 0);
        Notification::assertNothingSent();
    })->with([
        'missing email' => [['email' => null], 'email'],
        'blank email' => [['email' => '   '], 'email'],
        'invalid email' => [['email' => 'no-es-correo'], 'email'],
        'long email' => [['email' => str_repeat('a', 250).'@x.mx'], 'email'],
        'long company name' => [['trade_name' => str_repeat('c', 151)], 'trade_name'],
        'long person name' => [['person_name' => str_repeat('n', 121)], 'person_name'],
        'unknown delivery' => [['delivery_method' => 'whatsapp'], 'delivery_method'],
    ]);

    it('rejects by name the profile data that the company captures itself', function () {
        signInSecretary($this);

        $this->browserRequest('POST', '/api/companies', [...invitePayload(), ...companyPayload(), 'is_active' => false, 'location' => 'POINT(0 0)'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['legal_name' => 'Este dato lo captura la empresa desde su perfil.'])
            ->assertJsonValidationErrors(['rfc', 'sector_code', 'state_code', 'municipality_code', 'contact_name', 'contact_email', 'validation_reference', 'is_active', 'location']);
        $this->assertDatabaseCount('companies', 0);
    });

    it('invites nothing when the email already belongs to an account, ignoring case', function () {
        Notification::fake();
        User::factory()->role(UserRole::SECRETARY)->create(['email' => 'dual@manugolfo.test']);
        signInSecretary($this);

        $this->browserRequest('POST', '/api/companies', invitePayload(['email' => 'DUAL@manugolfo.test']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => 'El correo ya está registrado en otra cuenta.']);

        $this->assertDatabaseCount('companies', 0);
        Notification::assertNothingSent();
    });

    it('rolls the company and its audit event back when the email is taken after validation', function () {
        Notification::fake();
        signInSecretary($this);
        $dispatcher = Company::getEventDispatcher();
        Company::setEventDispatcher(clone $dispatcher);

        try {
            // El FormRequest ya pasó: solo la restricción de la base puede detectar este choque.
            Company::created(fn () => User::factory()->create(['email' => 'dual@manugolfo.test']));
            $this->browserRequest('POST', '/api/companies', invitePayload())
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['email' => 'El correo ya está registrado en otra cuenta.']);
        } finally {
            Company::setEventDispatcher($dispatcher);
        }

        $this->assertDatabaseCount('companies', 0);
        $this->assertDatabaseCount('account_audit_events', 0);
        Notification::assertNothingSent();
    });
});

describe('edición de la Secretaría con el perfil opcional (HU-S14-02 CA-02, CA-03, M4)', function () {
    it('accepts the whole profile empty and normalizes blanks to null', function () {
        $company = Company::factory()->create();
        signInSecretary($this);

        $this->browserRequest('PUT', '/api/companies/'.$company->id, [
            'legal_name' => '  ', 'trade_name' => '', 'rfc' => ' ', 'sector_code' => '', 'state_code' => '', 'municipality_code' => '',
            'contact_name' => '', 'contact_position' => null, 'contact_email' => ' ', 'contact_phone' => '', 'validation_reference' => '',
        ])->assertOk()
            ->assertJsonPath('data.name', null)
            ->assertJsonPath('data.rfc', null)
            ->assertJsonPath('data.state_code', null)
            ->assertJsonPath('data.municipality', null)
            ->assertJsonPath('data.contact_email', null)
            ->assertJsonPath('data.profile_status', 'pending_access');
        expect(DB::table('companies')->where('id', $company->id)->value('location'))->toBeNull();
    });

    it('keeps the format, the uniqueness and the uppercase of an RFC when it is captured', function (string $rfc) {
        $company = Company::factory()->create();
        signInSecretary($this);

        $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['rfc' => $rfc]))
            ->assertOk()->assertJsonPath('data.rfc', mb_strtoupper(trim($rfc)));
    })->with(['HEGL850101AB3', 'ÑAM000229XY9', ' a&b991231zz0 ']);

    it('ignores coordinates, status and registrant sent by the client (CA-05, CA-06)', function () {
        $company = Company::factory()->create(['registered_by' => $this->secretary->id]);
        $other = User::factory()->role(UserRole::SECRETARY)->create();
        signInSecretary($this);

        $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload([
            'latitude' => 19.4, 'longitude' => -99.1, 'location' => 'SRID=4326;POINT(-99.1 19.4)',
            'is_active' => false, 'registered_by' => $other->id, 'id' => 999,
        ]))->assertOk()->assertJsonMissingPath('data.latitude')->assertJsonMissingPath('data.location');

        $company->refresh();
        expect($company->is_active)->toBeTrue()
            ->and($company->registered_by)->toBe($this->secretary->id)
            ->and(companyPoint($company->id))->toBe([26.0924, -98.2781]);
    });

    it('validates the captured fields without writing them', function (array $overrides, string $field) {
        $company = Company::factory()->create(['legal_name' => 'Original, S.A.']);
        signInSecretary($this);

        $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload($overrides))
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        expect($company->fresh()->legal_name)->toBe('Original, S.A.');
    })->with([
        'long legal name' => [['legal_name' => str_repeat('r', 201)], 'legal_name'],
        'long trade name' => [['trade_name' => str_repeat('c', 151)], 'trade_name'],
        'rfc too short' => [['rfc' => 'MGO150320AB'], 'rfc'],
        'rfc too long' => [['rfc' => 'MGOX150320AB12'], 'rfc'],
        'rfc with invalid date' => [['rfc' => 'MGO151320AB1'], 'rfc'],
        'rfc with 30 February' => [['rfc' => 'MGO150230AB1'], 'rfc'],
        'rfc with symbols' => [['rfc' => 'MG-150320AB1'], 'rfc'],
        'generic rfc' => [['rfc' => 'XAXX010101000'], 'rfc'],
        'foreign generic rfc' => [['rfc' => 'XEXX010101000'], 'rfc'],
        'numeric rfc' => [['rfc' => 123456789012], 'rfc'],
        'unknown sector' => [['sector_code' => '99'], 'sector_code'],
        'sector subcode' => [['sector_code' => '31'], 'sector_code'],
        'state without municipality' => [['municipality_code' => null], 'municipality_code'],
        'municipality without state' => [['state_code' => null], 'state_code'],
        'unknown state' => [['state_code' => '33'], 'state_code'],
        'municipality of another state' => [['municipality_code' => '19039'], 'municipality_code'],
        'municipality as text' => [['municipality_code' => 'Reynosa'], 'municipality_code'],
        'long contact name' => [['contact_name' => str_repeat('n', 121)], 'contact_name'],
        'invalid contact email' => [['contact_email' => 'no-es-correo'], 'contact_email'],
        'position too long' => [['contact_position' => str_repeat('a', 121)], 'contact_position'],
        'phone with letters' => [['contact_phone' => '899-CALL-NOW'], 'contact_phone'],
        'phone too short' => [['contact_phone' => '899 123 45'], 'contact_phone'],
        'phone too long' => [['contact_phone' => str_repeat('1', 21)], 'contact_phone'],
        'long validation reference' => [['validation_reference' => str_repeat('f', 61)], 'validation_reference'],
    ]);

    it('accepts every sector of the SCIAN catalog (CA-04)', function () {
        $company = Company::factory()->create();
        signInSecretary($this);
        expect(EconomicSector::values())->toHaveCount(20);

        foreach (EconomicSector::values() as $sector) {
            $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['sector_code' => $sector]))
                ->assertOk()->assertJsonPath('data.sector_code', $sector);
        }
    });

    it('rejects a duplicated RFC even among inactive companies, while several companies can have none (CA-03)', function (string $rfc) {
        Company::factory()->inactive()->create(['rfc' => 'MGO150320AB1']);
        $company = Company::factory()->create(['rfc' => 'OTR010101AA1']);
        Company::factory()->count(2)->create(['rfc' => null]);
        signInSecretary($this);

        $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['rfc' => $rfc]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['rfc' => 'Ya existe una empresa registrada con ese RFC.']);
        expect($company->fresh()->rfc)->toBe('OTR010101AA1');
    })->with(['MGO150320AB1', 'mgo150320ab1']);

    it('reports the profile status: pending access, incomplete and complete', function () {
        $pending = Company::factory()->create();
        User::factory()->forCompany($pending)->create(['password_setup_required' => true]);
        $incomplete = Company::factory()->create(['rfc' => null]);
        User::factory()->forCompany($incomplete)->create();
        $complete = Company::factory()->create(['contact_position' => 'Recursos Humanos']);
        User::factory()->forCompany($complete)->create();
        signInSecretary($this);

        expect($this->browserRequest('GET', "/api/companies/{$pending->id}")->json('data.profile_status'))->toBe('pending_access')
            ->and($this->browserRequest('GET', "/api/companies/{$incomplete->id}")->json('data.missing'))->toBe(['contact_position', 'rfc'])
            ->and($this->browserRequest('GET', "/api/companies/{$incomplete->id}")->json('data.profile_status'))->toBe('incomplete')
            ->and($this->browserRequest('GET', "/api/companies/{$complete->id}")->json('data.profile_status'))->toBe('complete');
    });
});

it('enforces the company rules in the database', function (array $values) {
    $company = Company::factory()->create();

    expect(fn () => DB::table('companies')->where('id', $company->id)->update($values))->toThrow(QueryException::class);
})->with([
    'lowercase rfc' => [['rfc' => 'mgo150320ab1']],
    'unknown sector' => [['sector_code' => '99']],
    'municipality of another state' => [['municipality_code' => '19039']],
    'location without municipality' => [['location' => null]],
    'state without municipality' => [['municipality_code' => null]],
    'blank legal name' => [['legal_name' => '  ']],
    'blank rfc' => [['rfc' => '']],
    'blank contact email' => [['contact_email' => '']],
]);

it('shows and updates a company, recalculating the point when the municipality changes', function () {
    $company = Company::factory()->create(['registered_by' => $this->secretary->id]);
    signInSecretary($this);

    $this->browserRequest('GET', '/api/companies/'.$company->id)
        ->assertOk()
        ->assertJsonPath('data.rfc', $company->rfc)
        ->assertJsonPath('data.municipality', 'Victoria')
        ->assertJsonPath('data.registered_by.id', $this->secretary->id);

    // Edición por otra cuenta de la Secretaría: el registrante original se conserva.
    $colleague = User::factory()->role(UserRole::SECRETARY)->create();
    $this->browserRequest('POST', '/api/logout')->assertNoContent();
    $this->loginWithCookies($colleague)->assertOk();
    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload([
        'rfc' => $company->rfc, 'state_code' => '19', 'municipality_code' => '19039', 'legal_name' => 'Nuevo Nombre, S.C.',
    ]))->assertOk()
        ->assertJsonPath('data.legal_name', 'Nuevo Nombre, S.C.')
        ->assertJsonPath('data.municipality', 'Monterrey')
        ->assertJsonPath('data.registered_by.id', $this->secretary->id);

    expect(companyPoint($company->id))->toBe([25.6647, -100.3109]);
});

it('keeps its own RFC on update but rejects one of another company', function () {
    $company = Company::factory()->create(['rfc' => 'AAA010101AA1']);
    Company::factory()->create(['rfc' => 'BBB010101BB2']);
    signInSecretary($this);

    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['rfc' => 'aaa010101aa1']))->assertOk();
    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['rfc' => 'BBB010101BB2']))
        ->assertUnprocessable()->assertJsonValidationErrors('rfc');
    expect($company->fresh()->rfc)->toBe('AAA010101AA1');
});

it('inactivates and reactivates a company without deleting it (CA-07)', function () {
    $company = Company::factory()->create();
    signInSecretary($this);

    $this->browserRequest('PATCH', '/api/companies/'.$company->id.'/status', ['is_active' => false])
        ->assertOk()->assertJsonPath('data.is_active', false);
    $this->browserRequest('GET', '/api/companies')->assertOk()->assertJsonPath('data.0.is_active', false);
    $this->browserRequest('PATCH', '/api/companies/'.$company->id.'/status', ['is_active' => true])
        ->assertOk()->assertJsonPath('data.is_active', true);

    $this->browserRequest('DELETE', '/api/companies/'.$company->id)->assertStatus(405);
    expect(Company::count())->toBe(1);
});

it('requires a strict boolean to change the status', function (mixed $value) {
    $company = Company::factory()->create();
    signInSecretary($this);

    $this->browserRequest('PATCH', '/api/companies/'.$company->id.'/status', ['is_active' => $value])
        ->assertUnprocessable()->assertJsonValidationErrors('is_active');
    expect($company->fresh()->is_active)->toBeTrue();
})->with([null, 'false', 0, 'no']);

it('lists active and inactive companies, paginated and ordered by visible name with the unnamed ones last (CA-08)', function () {
    Company::factory()->create(['legal_name' => 'Zeta Logística', 'trade_name' => null, 'rfc' => 'ZLO010101AA1']);
    Company::factory()->inactive()->create(['legal_name' => 'alfa Software', 'trade_name' => null, 'rfc' => 'ASO010101AA1']);
    $invited = Company::factory()->create(['legal_name' => null, 'trade_name' => null, 'rfc' => null]);
    User::factory()->forCompany($invited)->create(['email' => 'invitada@empresa.test', 'password_setup_required' => true]);
    signInSecretary($this);

    $response = $this->browserRequest('GET', '/api/companies')
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('meta', ['current_page' => 1, 'last_page' => 1, 'total' => 3]);

    expect(array_column($response->json('data'), 'name'))->toBe(['alfa Software', 'Zeta Logística', null]);
    expect($response->json('data.2'))->toMatchArray(['account_email' => 'invitada@empresa.test', 'profile_status' => 'pending_access']);
    expect(array_keys($response->json('data.0')))->toBe([
        'id', 'name', 'legal_name', 'trade_name', 'rfc', 'sector_code', 'state_code', 'municipality_code', 'municipality', 'is_active',
        'account_email', 'profile_status',
    ]);
});

it('searches by legal name, trade name or RFC without wildcards (CA-08)', function (string $query, array $expected) {
    Company::factory()->create(['legal_name' => 'Manufacturas del Golfo', 'trade_name' => 'ManuGolfo', 'rfc' => 'MGO150320AB1']);
    $services = Company::factory()->create(['legal_name' => 'Servicios Integrales 100%', 'trade_name' => null, 'rfc' => 'SIN010101AA1']);
    User::factory()->forCompany($services)->create(['email' => 'contacto@servicios.test']);
    signInSecretary($this);

    $names = array_column($this->browserRequest('GET', '/api/companies?q='.urlencode($query))->assertOk()->json('data'), 'legal_name');
    expect($names)->toBe($expected);
})->with([
    'legal name' => ['golfo', ['Manufacturas del Golfo']],
    'trade name' => ['MANUG', ['Manufacturas del Golfo']],
    'rfc' => ['sin0101', ['Servicios Integrales 100%']],
    'literal percent' => ['100%', ['Servicios Integrales 100%']],
    'percent is not a wildcard' => ['%', ['Servicios Integrales 100%']],
    'underscore is not a wildcard' => ['_', []],
    'no match' => ['inexistente', []],
    'account email' => ['contacto@servicios', ['Servicios Integrales 100%']],
]);

it('paginates the list in pages of 50', function () {
    Company::factory()->count(51)->sequence(fn ($sequence) => ['rfc' => sprintf('PAG0101%02dAA1', $sequence->index), 'legal_name' => sprintf('Empresa %02d', $sequence->index)])->create();
    signInSecretary($this);

    $this->browserRequest('GET', '/api/companies?page=2')->assertOk()
        ->assertJsonPath('meta', ['current_page' => 2, 'last_page' => 2, 'total' => 51])
        ->assertJsonCount(1, 'data');
});

it('answers 404 for missing or malformed company identifiers', function (string $id) {
    signInSecretary($this);

    $this->browserRequest('GET', '/api/companies/'.$id)->assertNotFound();
    $this->browserRequest('PUT', '/api/companies/'.$id, companyPayload())->assertNotFound();
    expect(Company::count())->toBe(0);
})->with(['999999', '0', 'abc', '1e3', '99999999999999999999']);

it('only lets SECRETARY accounts manage companies (CA-01)', function (UserRole $role) {
    $company = Company::factory()->create();
    $user = $role === UserRole::INSTITUTION
        ? User::factory()->forInstitution(Institution::factory()->create())->create()
        : User::factory()->role($role)->create();
    // Una cuenta COMPANY trae su propia empresa.
    $companies = Company::count();
    $this->loginWithCookies($user)->assertOk();

    $this->browserRequest('GET', '/api/companies')->assertForbidden();
    $this->browserRequest('POST', '/api/companies', invitePayload())->assertForbidden();
    $this->browserRequest('GET', '/api/companies/'.$company->id)->assertForbidden();
    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload())->assertForbidden();
    $this->browserRequest('PATCH', '/api/companies/'.$company->id.'/status', ['is_active' => false])->assertForbidden();

    expect(Company::count())->toBe($companies)->and($company->fresh()->is_active)->toBeTrue();
})->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::COMPANY]);

it('rejects anonymous requests and requires CSRF to write', function () {
    $this->browserRequest('GET', '/api/companies')->assertUnauthorized();

    signInSecretary($this);
    $this->browserRequest('POST', '/api/companies', invitePayload(), csrf: false)->assertStatus(419);
    expect(Company::count())->toBe(0);
});

it('never creates accounts or sends links when editing (T-S8-12)', function () {
    Notification::fake();
    $company = Company::factory()->create();
    $account = User::factory()->forCompany($company)->create(['email' => 'dual@manugolfo.test', 'name' => 'Lucía Herrera']);
    signInSecretary($this);

    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['delivery_method' => 'manual']))
        ->assertUnprocessable()->assertJsonValidationErrors(['delivery_method' => 'Editar la empresa no envía enlaces: usa “Reenviar enlace”.']);
    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload(['contact_name' => 'Otra persona', 'contact_email' => 'nuevo@manugolfo.test']))
        ->assertOk()->assertJsonMissingPath('setup_delivery');

    expect(User::query()->where('company_id', $company->id)->sole()->only(['email', 'name']))->toBe(['email' => 'dual@manugolfo.test', 'name' => 'Lucía Herrera']);
    Notification::assertNothingSent();
});
