<?php

use App\Enums\MexicanState;
use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\Student;
use App\Models\User;
use App\Support\MunicipalityCatalog;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S4-04: catálogo INEGI de municipios y ubicación por municipio (PostGIS, Fase B).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

function municipalitiesUrl(string $state): string
{
    return '/api/catalogs/states/'.$state.'/municipalities';
}

/** [latitud, longitud] guardados del alumno, redondeados a 4 decimales, o null. */
function catalogStudentPoint(int $studentId): ?array
{
    $row = DB::selectOne('SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM students WHERE id = ?', [$studentId]);

    return $row->lat === null ? null : [round((float) $row->lat, 4), round((float) $row->lng, 4)];
}

function catalogAccount(UserRole $role): User
{
    return $role === UserRole::INSTITUTION
        ? User::factory()->forInstitution(Institution::factory()->create())->create()
        : User::factory()->role($role)->create();
}

it('loads the fixed INEGI edition with the exact number of municipalities (CA-01)', function () {
    expect(MunicipalityCatalog::EXPECTED_COUNT)->toBe(2478);
    expect(DB::table('municipalities')->count())->toBe(MunicipalityCatalog::EXPECTED_COUNT);
    expect(DB::table('municipalities')->distinct()->count('state_code'))->toBe(32);
    // Oaxaca concentra casi una cuarta parte de los municipios del país.
    expect(DB::table('municipalities')->where('state_code', '20')->count())->toBe(570);
    expect(DB::table('municipalities')->where('state_code', '09')->count())->toBe(16);
});

it('stores each municipal point as geography inside Mexico (CA-04)', function () {
    $type = DB::selectOne("SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'municipalities'::regclass AND attname = 'location'");
    expect($type->type)->toBe('geography(Point,4326)');

    $bounds = DB::selectOne('SELECT min(ST_Y(location::geometry)) AS min_lat, max(ST_Y(location::geometry)) AS max_lat,
        min(ST_X(location::geometry)) AS min_lng, max(ST_X(location::geometry)) AS max_lng FROM municipalities');
    expect((float) $bounds->min_lat)->toBeGreaterThan(14.5)
        ->and((float) $bounds->max_lat)->toBeLessThan(32.8)
        ->and((float) $bounds->min_lng)->toBeGreaterThan(-118.5)
        ->and((float) $bounds->max_lng)->toBeLessThan(-86.7);
});

it('documents the source, edition and legal attribution of the catalog (CA-02)', function () {
    $readme = file_get_contents(database_path('data/inegi/README.md'));

    expect($readme)->toContain('Fuente: INEGI')
        ->toContain('Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades')
        ->toContain('Términos de Libre Uso de la Información del INEGI')
        ->toContain('2,478');
    expect(fgets(fopen(MunicipalityCatalog::path(), 'r')))
        ->toBe("code,state_code,municipality_code,name,reference_locality_code,reference_locality_name,latitude,longitude\n");
});

it('reloads the catalog idempotently, restoring names and points without deleting rows (CA-03)', function () {
    DB::table('municipalities')->where('code', '28041')->update([
        'name' => 'Nombre alterado',
        'location' => DB::raw('ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography'),
    ]);

    expect(MunicipalityCatalog::sync())->toBe(MunicipalityCatalog::EXPECTED_COUNT);
    expect(MunicipalityCatalog::sync())->toBe(MunicipalityCatalog::EXPECTED_COUNT);

    expect(DB::table('municipalities')->count())->toBe(MunicipalityCatalog::EXPECTED_COUNT);
    expect(DB::table('municipalities')->where('code', '28041')->value('name'))->toBe('Victoria');
    $point = DB::selectOne("SELECT round(ST_Y(location::geometry)::numeric, 4) AS lat FROM municipalities WHERE code = '28041'");
    expect((float) $point->lat)->toBe(23.7311);
});

it('enforces the catalog keys in the database', function (array $row) {
    expect(fn () => DB::table('municipalities')->insert([
        ...$row,
        'location' => DB::raw('ST_SetSRID(ST_MakePoint(-99, 23), 4326)::geography'),
    ]))->toThrow(QueryException::class);
})->with([
    'municipality outside its state' => [['code' => '19999', 'state_code' => '28', 'name' => 'Inventado']],
    'unknown state' => [['code' => '33001', 'state_code' => '33', 'name' => 'Inventado']],
    'duplicated key' => [['code' => '28041', 'state_code' => '28', 'name' => 'Duplicado']],
]);

it('lists the municipalities of a state for every authenticated role (CA-07)', function (UserRole $role) {
    $this->loginWithCookies(catalogAccount($role))->assertOk();

    $response = $this->browserRequest('GET', municipalitiesUrl('09'))
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=86400, public');

    expect($response->json('data'))->toHaveCount(16)
        ->and($response->json('data.0'))->toBe(['code' => '09010', 'name' => 'Álvaro Obregón'])
        ->and(collect($response->json('data'))->pluck('code'))->toContain('09003', '09015');
})->with(UserRole::cases());

it('orders the municipalities by name and returns only the key and the name', function () {
    $this->loginWithCookies(catalogAccount(UserRole::INSTITUTION))->assertOk();

    $data = $this->browserRequest('GET', municipalitiesUrl('20'))->assertOk()->json('data');

    expect($data)->toHaveCount(570);
    $names = array_column($data, 'name');
    expect($names)->toBe(DB::table('municipalities')->where('state_code', '20')->orderBy('name')->orderBy('code')->pluck('name')->all());
    foreach ($data as $municipality) {
        expect(array_keys($municipality))->toBe(['code', 'name']);
    }
});

it('answers 404 for an invalid state key without querying the catalog', function (string $state) {
    $this->loginWithCookies(catalogAccount(UserRole::COMPANY))->assertOk();

    $this->browserRequest('GET', municipalitiesUrl($state))->assertNotFound();
})->with(['00', '33', '9', '280', 'ab', '-1', '28 ']);

it('rejects anonymous requests and inactive accounts', function () {
    $this->browserRequest('GET', municipalitiesUrl('28'))->assertUnauthorized();

    $account = catalogAccount(UserRole::SECRETARY);
    $this->loginWithCookies($account)->assertOk();
    $account->update(['is_active' => false]);
    $this->browserRequest('GET', municipalitiesUrl('28'))->assertUnauthorized();
});

/** Alumno con el expediente de la Fase A: municipio en texto libre y punto del estado. */
function legacyStudent(Institution $institution, ?string $state, ?string $municipality): int
{
    $student = Student::factory()->for($institution)->withIdentity()->create();
    DB::table('students')->where('id', $student->id)->update(['state_code' => $state, 'municipality' => $municipality]);
    if ($state !== null) {
        [$latitude, $longitude] = MexicanState::from($state)->referencePoint();
        DB::update('UPDATE students SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography WHERE id = ?', [$longitude, $latitude, $student->id]);
    }

    return $student->id;
}

describe('migration of free-text municipalities (CA-06)', function () {
    beforeEach(function () {
        $this->linkMigration = require database_path('migrations/2026_10_21_000002_link_students_to_municipalities.php');
        $this->institution = Institution::factory()->create();
    });

    it('assigns the INEGI key when the normalized name matches within the same state', function () {
        $this->linkMigration->down();
        $victoria = legacyStudent($this->institution, '28', 'Victoria');
        $coyoacan = legacyStudent($this->institution, '09', '  coyoacan ');
        $guanajuato = legacyStudent($this->institution, '11', 'VICTORIA');
        $this->linkMigration->up();

        expect(DB::table('students')->whereIn('id', [$victoria, $coyoacan, $guanajuato])->orderBy('id')->pluck('municipality_code')->all())
            ->toBe(['28041', '09003', '11043']);
        expect(DB::table('students')->whereIn('id', [$victoria, $coyoacan, $guanajuato])->whereNotNull('legacy_municipality')->exists())->toBeFalse();
        // El punto pasa de la capital del estado a la cabecera del municipio.
        expect(catalogStudentPoint($victoria))->toBe([23.7311, -99.1513]);
        expect(catalogStudentPoint($coyoacan))->toBe([19.3502, -99.1621]);
    });

    it('keeps unmatched texts pending with the state point, without losing the state', function () {
        $this->linkMigration->down();
        $unknown = legacyStudent($this->institution, '28', 'Ciudad Inventada');
        $wrongState = legacyStudent($this->institution, '19', 'Coyoacán');
        $withoutState = legacyStudent($this->institution, null, 'Victoria');
        $this->linkMigration->up();

        $rows = DB::table('students')->whereIn('id', [$unknown, $wrongState, $withoutState])->orderBy('id')
            ->get(['state_code', 'municipality_code', 'legacy_municipality']);
        expect($rows->pluck('municipality_code')->filter()->all())->toBe([]);
        expect($rows->pluck('legacy_municipality')->all())->toBe(['Ciudad Inventada', 'Coyoacán', 'Victoria']);
        expect($rows->pluck('state_code')->all())->toBe(['28', '19', null]);
        expect(catalogStudentPoint($unknown))->toBe([23.7369, -99.1411]);
        expect(catalogStudentPoint($withoutState))->toBeNull();
    });

    it('shows a pending municipality until the institution chooses one from the catalog', function () {
        $this->linkMigration->down();
        $pending = legacyStudent($this->institution, '28', 'Ciudad Inventada');
        $this->linkMigration->up();
        DB::table('students')->where('id', $pending)->update([
            'program' => 'Mecatrónica', 'period_type' => 'semester', 'period_number' => 4, 'dual_available' => true, 'can_relocate' => false,
        ]);
        $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

        $this->browserRequest('GET', '/api/students/'.$pending)->assertOk()
            ->assertJsonPath('data.profile.municipality_code', null)
            ->assertJsonPath('data.profile.municipality', null)
            ->assertJsonPath('data.profile.pending_municipality', 'Ciudad Inventada');

        $this->browserRequest('PUT', '/api/students/'.$pending.'/profile', [
            'program' => 'Mecatrónica', 'period_type' => 'semester', 'period_number' => 4, 'dual_available' => true,
            'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false,
        ])->assertOk()
            ->assertJsonPath('data.profile.municipality_code', '28032')
            ->assertJsonPath('data.profile.municipality', 'Reynosa')
            ->assertJsonPath('data.profile.pending_municipality', null);
        expect(catalogStudentPoint($pending))->toBe([26.0924, -98.2781]);
    });
});
