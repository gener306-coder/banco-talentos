<?php

use App\Enums\MexicanState;
use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentIdentity;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

function profilePayload(array $overrides = []): array
{
    return array_replace([
        'program' => 'Ingeniería en Sistemas Computacionales',
        'period_type' => 'semester',
        'period_number' => 6,
        'dual_available' => true,
        'state_code' => '28',
        'municipality' => 'Victoria',
        'can_relocate' => false,
    ], $overrides);
}

function identityPayload(array $overrides = []): array
{
    return array_replace([
        'enrollment_number' => 'A2026-001',
        'given_names' => 'María Fernanda',
        'first_surname' => 'López',
        'second_surname' => 'García',
    ], $overrides);
}

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->student = Student::factory()->for($this->institution)->withIdentity([
        'enrollment_number' => 'A2026-001', 'given_names' => 'María Fernanda', 'first_surname' => 'López', 'second_surname' => 'García',
    ])->create();
    $this->other = Institution::factory()->create();
    $this->foreign = Student::factory()->for($this->other)->withIdentity([
        'enrollment_number' => 'AJENO-1', 'given_names' => 'Ajeno', 'first_surname' => 'Externo',
    ])->create();
});

/** [latitud, longitud, SRID] del punto guardado, o null si no hay ubicación. */
function studentPoint(Student $student): ?array
{
    $row = DB::selectOne('SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, ST_SRID(location) AS srid FROM students WHERE id = ?', [$student->id]);

    return $row->lat === null ? null : [round((float) $row->lat, 4), round((float) $row->lng, 4), (int) $row->srid];
}

function signInProfileInstitution($test): void
{
    $test->loginWithCookies($test->account)->assertOk();
}

it('shows an own student with its identity and an empty profile (CA-01)', function () {
    signInProfileInstitution($this);
    $this->browserRequest('GET', '/api/students/'.$this->student->id)
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertExactJson(['data' => [
            'id' => $this->student->id,
            'enrollment_number' => 'A2026-001',
            'given_names' => 'María Fernanda',
            'first_surname' => 'López',
            'second_surname' => 'García',
            'created_at' => $this->student->created_at->toISOString(),
            'profile' => [
                'program' => null, 'period_type' => null, 'period_number' => null, 'dual_available' => null,
                'state_code' => null, 'municipality' => null, 'can_relocate' => null,
            ],
        ]]);
});

it('saves the academic, geographic and mobility profile (CA-02, CA-03, CA-04)', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload())
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('data.enrollment_number', 'A2026-001')
        ->assertJsonPath('data.profile', [
            'program' => 'Ingeniería en Sistemas Computacionales', 'period_type' => 'semester', 'period_number' => 6,
            'dual_available' => true, 'state_code' => '28', 'municipality' => 'Victoria', 'can_relocate' => false,
        ]);

    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload([
        'program' => '  Licenciatura en Administración  ', 'period_type' => 'four_month', 'period_number' => 15,
        'dual_available' => false, 'state_code' => '09', 'municipality' => 'Coyoacán', 'can_relocate' => true,
    ]))->assertOk();

    $this->browserRequest('GET', '/api/students/'.$this->student->id)->assertOk()
        ->assertJsonPath('data.profile.program', 'Licenciatura en Administración')
        ->assertJsonPath('data.profile.period_type', 'four_month')
        ->assertJsonPath('data.profile.period_number', 15)
        ->assertJsonPath('data.profile.dual_available', false)
        ->assertJsonPath('data.profile.state_code', '09')
        ->assertJsonPath('data.profile.can_relocate', true);
});

it('never changes the identity, the institution or other students through the profile', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload([
        'institution_id' => $this->other->id, 'id' => $this->foreign->id,
        'enrollment_number' => 'FALSO-1', 'given_names' => 'Falso',
    ]))->assertOk()->assertJsonPath('data.id', $this->student->id);

    expect($this->student->fresh()->institution_id)->toBe($this->institution->id);
    expect($this->student->identity->fresh()->only(['enrollment_number', 'given_names']))
        ->toBe(['enrollment_number' => 'A2026-001', 'given_names' => 'María Fernanda']);
    expect($this->foreign->fresh()->program)->toBeNull();
});

it('validates the profile without writing it (CA-06)', function (array $overrides, string $field) {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload($overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect($this->student->fresh()->only(Student::PROFILE_ATTRIBUTES))->each->toBeNull();
    expect(studentPoint($this->student))->toBeNull();
})->with([
    'missing program' => [['program' => null], 'program'],
    'blank program' => [['program' => '   '], 'program'],
    'long program' => [['program' => str_repeat('p', 151)], 'program'],
    'array program' => [['program' => ['x']], 'program'],
    'missing period type' => [['period_type' => null], 'period_type'],
    'unknown period type' => [['period_type' => 'trimester'], 'period_type'],
    'missing period number' => [['period_number' => null], 'period_number'],
    'period number zero' => [['period_number' => 0], 'period_number'],
    'period number 16' => [['period_number' => 16], 'period_number'],
    'fractional period number' => [['period_number' => 2.5], 'period_number'],
    'textual period number' => [['period_number' => 'sexto'], 'period_number'],
    'missing dual availability' => [['dual_available' => null], 'dual_available'],
    'textual dual availability' => [['dual_available' => 'quizá'], 'dual_available'],
    'missing state' => [['state_code' => null], 'state_code'],
    'state 00' => [['state_code' => '00'], 'state_code'],
    'state 33' => [['state_code' => '33'], 'state_code'],
    'state without leading zero' => [['state_code' => '9'], 'state_code'],
    'state as name' => [['state_code' => 'Tamaulipas'], 'state_code'],
    'numeric state' => [['state_code' => 28], 'state_code'],
    'missing municipality' => [['municipality' => null], 'municipality'],
    'blank municipality' => [['municipality' => '  '], 'municipality'],
    'long municipality' => [['municipality' => str_repeat('m', 121)], 'municipality'],
    'missing relocation' => [['can_relocate' => null], 'can_relocate'],
    'textual relocation' => [['can_relocate' => 'sí'], 'can_relocate'],
]);

it('accepts every state of the INEGI catalog', function () {
    signInProfileInstitution($this);
    foreach (range(1, 32) as $code) {
        $state = str_pad((string) $code, 2, '0', STR_PAD_LEFT);
        $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload(['state_code' => $state]))
            ->assertOk()->assertJsonPath('data.profile.state_code', $state);
    }
});

it('answers 404 for a student of another institution or a missing one, without writing (CA-05)', function (string $method, string $suffix) {
    signInProfileInstitution($this);
    $payload = $suffix === '/identity' ? identityPayload(['enrollment_number' => 'NUEVO-1']) : profilePayload();
    $missing = Student::max('id') + 100;

    foreach ([$this->foreign->id, $missing] as $id) {
        $this->browserRequest($method, '/api/students/'.$id.$suffix, $payload)
            ->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
    }

    expect($this->foreign->fresh()->program)->toBeNull();
    expect($this->foreign->identity->fresh()->enrollment_number)->toBe('AJENO-1');
})->with([
    'show' => ['GET', ''],
    'profile' => ['PUT', '/profile'],
    'identity' => ['PUT', '/identity'],
]);

it('answers 404 for malformed or out of range identifiers', function (string $id) {
    signInProfileInstitution($this);
    $this->browserRequest('GET', '/api/students/'.$id)->assertNotFound();
    $this->browserRequest('PUT', '/api/students/'.$id.'/profile', profilePayload())->assertNotFound();
})->with(['zero' => ['0'], 'negative' => ['-1'], 'text' => ['abc'], 'bigint overflow' => ['99999999999999999999'], 'leading zero' => ['01']]);

it('corrects the enrollment number and the name of an own student (CA-07)', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload())->assertOk();

    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload([
        'enrollment_number' => 'A2026-101', 'given_names' => 'María Fernanda', 'first_surname' => 'Lopez', 'second_surname' => '',
    ]))->assertOk()
        ->assertJsonPath('data.enrollment_number', 'A2026-101')
        ->assertJsonPath('data.first_surname', 'Lopez')
        ->assertJsonPath('data.second_surname', null)
        ->assertJsonPath('data.profile.program', 'Ingeniería en Sistemas Computacionales');

    $this->assertDatabaseCount('student_identities', 2);
    expect($this->student->identity->fresh()->institution_id)->toBe($this->institution->id);
});

it('lets a student keep its own enrollment number or change only its case (CA-07)', function (string $enrollment) {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload(['enrollment_number' => $enrollment]))
        ->assertOk()->assertJsonPath('data.enrollment_number', $enrollment);
})->with(['same' => ['A2026-001'], 'lowercase' => ['a2026-001']]);

it('rejects an enrollment number already used by another student of the institution (CA-07)', function (string $duplicate) {
    Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'B-200'])->create();
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload(['enrollment_number' => $duplicate, 'given_names' => 'Cambiado']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['enrollment_number' => 'Ya existe un alumno con esa matrícula en tu institución.']);
    expect($this->student->identity->fresh()->only(['enrollment_number', 'given_names']))
        ->toBe(['enrollment_number' => 'A2026-001', 'given_names' => 'María Fernanda']);
})->with(['same' => ['B-200'], 'lowercase' => ['b-200']]);

it('allows an enrollment number used in another institution (CA-07)', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload(['enrollment_number' => 'AJENO-1']))->assertOk();
});

it('relies on the database constraint when a concurrent change takes the enrollment number (CA-07)', function () {
    signInProfileInstitution($this);
    $dispatcher = StudentIdentity::getEventDispatcher();
    StudentIdentity::setEventDispatcher(clone $dispatcher);
    try {
        StudentIdentity::updating(function (StudentIdentity $pending): void {
            $competitor = DB::table('students')->insertGetId(['institution_id' => $pending->institution_id, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('student_identities')->insert([
                'student_id' => $competitor, 'institution_id' => $pending->institution_id,
                'enrollment_number' => strtolower($pending->enrollment_number),
                'given_names' => 'Competidor', 'first_surname' => 'Concurrente',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload(['enrollment_number' => 'C-300']))
            ->assertUnprocessable()->assertJsonValidationErrors('enrollment_number');
    } finally {
        StudentIdentity::setEventDispatcher($dispatcher);
    }
    expect($this->student->identity->fresh()->enrollment_number)->toBe('A2026-001');
});

it('validates the identity correction with the registration rules', function (array $overrides, string $field) {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload($overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect($this->student->identity->fresh()->enrollment_number)->toBe('A2026-001');
})->with([
    'missing enrollment' => [['enrollment_number' => null], 'enrollment_number'],
    'enrollment with spaces' => [['enrollment_number' => 'A 001'], 'enrollment_number'],
    'long enrollment' => [['enrollment_number' => str_repeat('A', 31)], 'enrollment_number'],
    'missing given names' => [['given_names' => null], 'given_names'],
    'missing first surname' => [['first_surname' => '  '], 'first_surname'],
    'long second surname' => [['second_surname' => str_repeat('s', 121)], 'second_surname'],
]);

it('only lets INSTITUTION accounts read or change a student', function (UserRole $role) {
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
    $this->browserRequest('GET', '/api/students/'.$this->student->id)->assertForbidden();
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload())->assertForbidden();
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload(['enrollment_number' => 'X-1']))->assertForbidden();
    expect($this->student->fresh()->program)->toBeNull();
    expect($this->student->identity->fresh()->enrollment_number)->toBe('A2026-001');
})->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

it('rejects anonymous requests and accounts without a linked institution', function () {
    $this->startCookieSession();
    $this->browserRequest('GET', '/api/students/'.$this->student->id)->assertUnauthorized();
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload())->assertUnauthorized();

    $this->loginWithCookies(User::factory()->role(UserRole::INSTITUTION)->create(['institution_id' => null]))->assertOk();
    $this->browserRequest('GET', '/api/students/'.$this->student->id)->assertForbidden();
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload())->assertForbidden();
    expect($this->student->fresh()->program)->toBeNull();
});

it('requires CSRF to change a student', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload(), csrf: false)->assertStatus(419);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', identityPayload(['enrollment_number' => 'X-1']), csrf: false)->assertStatus(419);
    expect($this->student->fresh()->program)->toBeNull();
    expect($this->student->identity->fresh()->enrollment_number)->toBe('A2026-001');
});

it('stores the public profile in students and keeps the identity apart', function () {
    foreach (Student::PROFILE_ATTRIBUTES as $column) {
        expect(Schema::hasColumn('students', $column))->toBeTrue();
        expect(Schema::hasColumn('student_identities', $column))->toBeFalse();
    }
});

it('enforces the profile rules in the database', function (array $values) {
    expect(fn () => DB::table('students')->where('id', $this->student->id)->update($values))->toThrow(QueryException::class);
})->with([
    'unknown period type' => [['period_type' => 'trimester', 'period_number' => 1]],
    'period number out of range' => [['period_type' => 'semester', 'period_number' => 16]],
    'period type without number' => [['period_type' => 'semester']],
    'period number without type' => [['period_number' => 3]],
    'unknown state' => [['state_code' => '33']],
]);

it('stores the location as a PostGIS geography point with a spatial index', function () {
    $type = DB::selectOne("SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'students'::regclass AND attname = 'location'");
    expect($type->type)->toBe('geography(Point,4326)');
    expect(DB::selectOne("SELECT indexdef FROM pg_indexes WHERE tablename = 'students' AND indexname = 'students_location_gist'")->indexdef)
        ->toContain('USING gist (location)');
});

it('has no location until the profile is saved', function () {
    expect(studentPoint($this->student))->toBeNull();
});

it('derives the location from the state reference point on the server', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload(['state_code' => '28']))->assertOk();
    expect(studentPoint($this->student))->toBe([23.7369, -99.1411, 4326]);

    // Al cambiar de estado se recalcula: el punto nunca queda desfasado del estado guardado.
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload(['state_code' => '19']))->assertOk();
    expect(studentPoint($this->student))->toBe([25.6866, -100.3161, 4326]);
});

it('ignores coordinates sent by the client, so an exact location can never be stored (CA-03)', function (array $forged) {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload(['state_code' => '09', ...$forged]))
        ->assertOk()
        ->assertJsonMissingPath('data.location')
        ->assertJsonMissingPath('data.profile.location')
        ->assertJsonMissingPath('data.profile.latitude')
        ->assertJsonMissingPath('data.profile.longitude');
    expect(studentPoint($this->student))->toBe([19.4326, -99.1332, 4326]);
})->with([
    'exact address' => [['latitude' => 19.35612, 'longitude' => -99.16233]],
    'location field' => [['location' => 'SRID=4326;POINT(-99.16233 19.35612)']],
    'out of range' => [['latitude' => 999, 'longitude' => 'x']],
]);

it('never exposes the location in the detail', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload())->assertOk();
    $this->browserRequest('GET', '/api/students/'.$this->student->id)->assertOk()
        ->assertJsonMissingPath('data.location')->assertJsonMissingPath('data.profile.location');
    expect($this->student->fresh()->toArray())->not->toHaveKey('location');
});

it('leaves the location untouched for a foreign student (CA-05)', function () {
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->foreign->id.'/profile', profilePayload())->assertNotFound();
    expect(studentPoint($this->foreign))->toBeNull();
});

it('places every state reference point inside Mexico', function (MexicanState $state) {
    [$latitude, $longitude] = $state->referencePoint();
    expect($latitude)->toBeGreaterThan(14.5)->toBeLessThan(32.8);
    expect($longitude)->toBeGreaterThan(-118.5)->toBeLessThan(-86.7);
})->with(MexicanState::cases());

it('supports radius searches in meters with ST_DWithin', function () {
    $monterrey = Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'MTY-1'])->create();
    signInProfileInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', profilePayload(['state_code' => '28']))->assertOk();
    $this->browserRequest('PUT', '/api/students/'.$monterrey->id.'/profile', profilePayload(['state_code' => '19']))->assertOk();

    // Desde Ciudad Victoria: Monterrey está a unos 250 km.
    $within = fn (int $meters): array => collect(DB::select(
        'SELECT id FROM students WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?) ORDER BY id',
        [-99.1411, 23.7369, $meters],
    ))->pluck('id')->all();

    expect($within(100_000))->toBe([$this->student->id]);
    expect($within(400_000))->toBe([$this->student->id, $monterrey->id]);
});
