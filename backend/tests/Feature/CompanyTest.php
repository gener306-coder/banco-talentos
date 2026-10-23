<?php

use App\Enums\EconomicSector;
use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S4-02: registro y gestión de empresas validadas por la Secretaría de Economía.
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

it('registers a validated company with the minimal data (CA-02, CA-05, CA-06)', function () {
    signInSecretary($this);

    $response = $this->browserRequest('POST', '/api/companies', companyPayload(['rfc' => ' mgo150320ab1 ', 'contact_email' => ' DUAL@ManuGolfo.test ']))
        ->assertCreated()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('data.legal_name', 'Manufacturas del Golfo, S.A. de C.V.')
        ->assertJsonPath('data.rfc', 'MGO150320AB1')
        ->assertJsonPath('data.sector_code', '31-33')
        ->assertJsonPath('data.state_code', '28')
        ->assertJsonPath('data.municipality_code', '28032')
        ->assertJsonPath('data.municipality', 'Reynosa')
        ->assertJsonPath('data.contact_email', 'dual@manugolfo.test')
        ->assertJsonPath('data.is_active', true)
        ->assertJsonPath('data.registered_by', ['id' => $this->secretary->id, 'name' => 'Analista SE'])
        ->assertJsonMissingPath('data.location');

    $id = $response->json('data.id');
    expect(Company::find($id)->registered_by)->toBe($this->secretary->id);
    // Cabecera de Reynosa, derivada por el servidor.
    expect(companyPoint($id))->toBe([26.0924, -98.2781]);
});

it('accepts only the required fields, leaving the optional ones empty (CA-02)', function () {
    signInSecretary($this);

    $this->browserRequest('POST', '/api/companies', companyPayload([
        'trade_name' => null, 'contact_phone' => '', 'validation_reference' => null,
    ]))->assertCreated()
        ->assertJsonPath('data.trade_name', null)
        ->assertJsonPath('data.contact_phone', null)
        ->assertJsonPath('data.validation_reference', null);
});

it('ignores coordinates, status and registrant sent by the client (CA-05, CA-06)', function () {
    signInSecretary($this);
    $other = User::factory()->role(UserRole::SECRETARY)->create();

    $id = $this->browserRequest('POST', '/api/companies', companyPayload([
        'latitude' => 19.4, 'longitude' => -99.1, 'location' => 'SRID=4326;POINT(-99.1 19.4)',
        'is_active' => false, 'registered_by' => $other->id, 'id' => 999,
    ]))->assertCreated()->assertJsonMissingPath('data.latitude')->json('data.id');

    $company = Company::find($id);
    expect($company->is_active)->toBeTrue()
        ->and($company->registered_by)->toBe($this->secretary->id)
        ->and(companyPoint($id))->toBe([26.0924, -98.2781]);
});

it('validates the company without writing it', function (array $overrides, string $field) {
    signInSecretary($this);

    $this->browserRequest('POST', '/api/companies', companyPayload($overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(Company::count())->toBe(0);
})->with([
    'missing legal name' => [['legal_name' => null], 'legal_name'],
    'long legal name' => [['legal_name' => str_repeat('r', 201)], 'legal_name'],
    'long trade name' => [['trade_name' => str_repeat('c', 151)], 'trade_name'],
    'missing rfc' => [['rfc' => null], 'rfc'],
    'rfc too short' => [['rfc' => 'MGO150320AB'], 'rfc'],
    'rfc too long' => [['rfc' => 'MGOX150320AB12'], 'rfc'],
    'rfc with invalid date' => [['rfc' => 'MGO151320AB1'], 'rfc'],
    'rfc with 30 February' => [['rfc' => 'MGO150230AB1'], 'rfc'],
    'rfc with symbols' => [['rfc' => 'MG-150320AB1'], 'rfc'],
    'generic rfc' => [['rfc' => 'XAXX010101000'], 'rfc'],
    'foreign generic rfc' => [['rfc' => 'XEXX010101000'], 'rfc'],
    'numeric rfc' => [['rfc' => 123456789012], 'rfc'],
    'missing sector' => [['sector_code' => null], 'sector_code'],
    'unknown sector' => [['sector_code' => '99'], 'sector_code'],
    'sector subcode' => [['sector_code' => '31'], 'sector_code'],
    'missing state' => [['state_code' => null], 'state_code'],
    'unknown state' => [['state_code' => '33'], 'state_code'],
    'missing municipality' => [['municipality_code' => null], 'municipality_code'],
    'municipality of another state' => [['municipality_code' => '19039'], 'municipality_code'],
    'municipality as text' => [['municipality_code' => 'Reynosa'], 'municipality_code'],
    'missing contact name' => [['contact_name' => null], 'contact_name'],
    'long contact name' => [['contact_name' => str_repeat('n', 121)], 'contact_name'],
    'missing contact email' => [['contact_email' => null], 'contact_email'],
    'invalid contact email' => [['contact_email' => 'no-es-correo'], 'contact_email'],
    'phone with letters' => [['contact_phone' => '899-CALL-NOW'], 'contact_phone'],
    'phone too short' => [['contact_phone' => '899 123 45'], 'contact_phone'],
    'phone too long' => [['contact_phone' => str_repeat('1', 21)], 'contact_phone'],
    'long validation reference' => [['validation_reference' => str_repeat('f', 61)], 'validation_reference'],
]);

it('accepts natural-person RFCs and RFCs with Ñ or & (CA-03)', function (string $rfc) {
    signInSecretary($this);

    $this->browserRequest('POST', '/api/companies', companyPayload(['rfc' => $rfc]))
        ->assertCreated()->assertJsonPath('data.rfc', mb_strtoupper($rfc));
})->with(['HEGL850101AB3', 'ÑAM000229XY9', 'a&b991231zz0']);

it('accepts every sector of the SCIAN catalog (CA-04)', function () {
    signInSecretary($this);
    expect(EconomicSector::values())->toHaveCount(20);

    foreach (EconomicSector::values() as $index => $sector) {
        $this->browserRequest('POST', '/api/companies', companyPayload([
            'sector_code' => $sector, 'rfc' => sprintf('SEC0101%02dAB1', $index + 1),
        ]))->assertCreated()->assertJsonPath('data.sector_code', $sector);
    }
});

it('rejects a duplicated RFC even among inactive companies (CA-03)', function (string $rfc) {
    Company::factory()->inactive()->create(['rfc' => 'MGO150320AB1']);
    signInSecretary($this);

    $this->browserRequest('POST', '/api/companies', companyPayload(['rfc' => $rfc]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['rfc' => 'Ya existe una empresa registrada con ese RFC.']);
    expect(Company::count())->toBe(1);
})->with(['MGO150320AB1', 'mgo150320ab1']);

it('enforces the company rules in the database', function (array $values) {
    $company = Company::factory()->create();

    expect(fn () => DB::table('companies')->where('id', $company->id)->update($values))->toThrow(QueryException::class);
})->with([
    'lowercase rfc' => [['rfc' => 'mgo150320ab1']],
    'unknown sector' => [['sector_code' => '99']],
    'municipality of another state' => [['municipality_code' => '19039']],
    'missing location' => [['location' => null]],
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

it('lists active and inactive companies, paginated and ordered by legal name (CA-08)', function () {
    Company::factory()->create(['legal_name' => 'Zeta Logística', 'rfc' => 'ZLO010101AA1']);
    Company::factory()->inactive()->create(['legal_name' => 'alfa Software', 'rfc' => 'ASO010101AA1']);
    signInSecretary($this);

    $response = $this->browserRequest('GET', '/api/companies')
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('meta', ['current_page' => 1, 'last_page' => 1, 'total' => 2]);

    expect(array_column($response->json('data'), 'legal_name'))->toBe(['alfa Software', 'Zeta Logística']);
    expect(array_keys($response->json('data.0')))->toBe([
        'id', 'legal_name', 'trade_name', 'rfc', 'sector_code', 'state_code', 'municipality_code', 'municipality', 'is_active',
    ]);
});

it('searches by legal name, trade name or RFC without wildcards (CA-08)', function (string $query, array $expected) {
    Company::factory()->create(['legal_name' => 'Manufacturas del Golfo', 'trade_name' => 'ManuGolfo', 'rfc' => 'MGO150320AB1']);
    Company::factory()->create(['legal_name' => 'Servicios Integrales 100%', 'trade_name' => null, 'rfc' => 'SIN010101AA1']);
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
    $this->browserRequest('POST', '/api/companies', companyPayload())->assertForbidden();
    $this->browserRequest('GET', '/api/companies/'.$company->id)->assertForbidden();
    $this->browserRequest('PUT', '/api/companies/'.$company->id, companyPayload())->assertForbidden();
    $this->browserRequest('PATCH', '/api/companies/'.$company->id.'/status', ['is_active' => false])->assertForbidden();

    expect(Company::count())->toBe($companies)->and($company->fresh()->is_active)->toBeTrue();
})->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::COMPANY]);

it('rejects anonymous requests and requires CSRF to write', function () {
    $this->browserRequest('GET', '/api/companies')->assertUnauthorized();

    signInSecretary($this);
    $this->browserRequest('POST', '/api/companies', companyPayload(), csrf: false)->assertStatus(419);
    expect(Company::count())->toBe(0);
});
