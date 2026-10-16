<?php

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

function studentPayload(array $overrides = []): array
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
});

function signInInstitution($test, ?User $account = null): void
{
    $test->loginWithCookies($account ?? $test->account)->assertOk();
}

it('registers a student under the institution of the session and returns its internal identity (CA-02, CA-03)', function () {
    signInInstitution($this);
    $response = $this->browserRequest('POST', '/api/students', studentPayload())
        ->assertCreated()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('data.enrollment_number', 'A2026-001')
        ->assertJsonPath('data.given_names', 'María Fernanda')
        ->assertJsonPath('data.first_surname', 'López')
        ->assertJsonPath('data.second_surname', 'García')
        ->assertJsonMissingPath('data.institution_id');

    $student = Student::findOrFail($response->json('data.id'));
    expect($student->institution_id)->toBe($this->institution->id);
    expect($student->identity->institution_id)->toBe($this->institution->id);
    $this->assertDatabaseCount('students', 1);
    $this->assertDatabaseCount('student_identities', 1);
});

it('ignores a forged institution or any extra field sent by the client (CA-03)', function () {
    $other = Institution::factory()->create();
    signInInstitution($this);
    $response = $this->browserRequest('POST', '/api/students', studentPayload([
        'institution_id' => $other->id,
        'student_id' => 999,
        'id' => 999,
    ]))->assertCreated();

    expect(Student::findOrFail($response->json('data.id'))->institution_id)->toBe($this->institution->id);
    expect(Student::where('institution_id', $other->id)->exists())->toBeFalse();
});

it('accepts a missing or blank second surname', function (mixed $second) {
    signInInstitution($this);
    $this->browserRequest('POST', '/api/students', studentPayload(['second_surname' => $second]))
        ->assertCreated()->assertJsonPath('data.second_surname', null);
})->with(['missing' => [null], 'blank' => ['   ']]);

it('lists exclusively the students of the institution of the session (CA-04)', function () {
    Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'PROPIO-1', 'first_surname' => 'Zamora'])->create();
    Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'PROPIO-2', 'first_surname' => 'Álvarez'])->create();
    $other = Institution::factory()->create();
    Student::factory()->for($other)->withIdentity(['enrollment_number' => 'AJENO-1'])->create();

    signInInstitution($this);
    $response = $this->browserRequest('GET', '/api/students')
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('meta.total', 2)
        ->assertJsonCount(2, 'data');

    expect(collect($response->json('data'))->pluck('enrollment_number')->all())->toEqualCanonicalizing(['PROPIO-1', 'PROPIO-2']);
    expect($response->getContent())->not->toContain('AJENO-1');
});

it('orders the roster by surnames and given names', function () {
    foreach ([['B-1', 'Ana', 'Ruiz', 'Soto'], ['B-2', 'Luis', 'Ruiz', 'Arias'], ['B-3', 'Eva', 'Báez', null]] as [$number, $given, $first, $second]) {
        Student::factory()->for($this->institution)->withIdentity([
            'enrollment_number' => $number, 'given_names' => $given, 'first_surname' => $first, 'second_surname' => $second,
        ])->create();
    }
    signInInstitution($this);
    $order = collect($this->browserRequest('GET', '/api/students')->assertOk()->json('data'))->pluck('enrollment_number')->all();
    expect($order)->toBe(['B-3', 'B-2', 'B-1']);
});

it('paginates the roster in pages of 50', function () {
    Student::factory()->count(51)->for($this->institution)->withIdentity()->create();
    signInInstitution($this);
    $this->browserRequest('GET', '/api/students')->assertOk()
        ->assertJsonCount(50, 'data')->assertJsonPath('meta.last_page', 2)->assertJsonPath('meta.total', 51);
    $this->browserRequest('GET', '/api/students?page=2')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('meta.current_page', 2);
});

it('returns an empty roster for an institution without students', function () {
    Student::factory()->for(Institution::factory())->withIdentity()->create();
    signInInstitution($this);
    $this->browserRequest('GET', '/api/students')->assertOk()
        ->assertExactJson(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'total' => 0]]);
});

it('rejects a duplicate enrollment number within the institution, regardless of case (CA-06)', function (string $duplicate) {
    Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'A2026-001'])->create();
    signInInstitution($this);
    $this->browserRequest('POST', '/api/students', studentPayload(['enrollment_number' => $duplicate]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['enrollment_number' => 'Ya existe un alumno con esa matrícula en tu institución.']);
    $this->assertDatabaseCount('students', 1);
    $this->assertDatabaseCount('student_identities', 1);
})->with(['same' => ['A2026-001'], 'lowercase' => ['a2026-001'], 'surrounding spaces' => ['  A2026-001  ']]);

it('allows the same enrollment number in a different institution (CA-06)', function () {
    Student::factory()->for(Institution::factory())->withIdentity(['enrollment_number' => 'A2026-001'])->create();
    signInInstitution($this);
    $this->browserRequest('POST', '/api/students', studentPayload())->assertCreated();
    $this->assertDatabaseCount('student_identities', 2);
});

it('relies on the database constraint when a concurrent registration takes the enrollment number', function () {
    signInInstitution($this);
    $dispatcher = StudentIdentity::getEventDispatcher();
    StudentIdentity::setEventDispatcher(clone $dispatcher);
    try {
        StudentIdentity::creating(function (StudentIdentity $pending): void {
            // La validación previa ya pasó: solo la restricción de PostgreSQL puede detectar este conflicto.
            $competitor = DB::table('students')->insertGetId(['institution_id' => $pending->institution_id, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('student_identities')->insert([
                'student_id' => $competitor, 'institution_id' => $pending->institution_id,
                'enrollment_number' => strtolower($pending->enrollment_number),
                'given_names' => 'Competidor', 'first_surname' => 'Concurrente',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $this->browserRequest('POST', '/api/students', studentPayload())
            ->assertUnprocessable()->assertJsonValidationErrors('enrollment_number');
    } finally {
        StudentIdentity::setEventDispatcher($dispatcher);
    }
    // La transacción se revierte entera: ni el alumno ni la identidad del alta fallida quedan.
    $this->assertDatabaseCount('students', 0);
    $this->assertDatabaseCount('student_identities', 0);
});

it('validates the registration without partial writes', function (array $overrides, string $field) {
    signInInstitution($this);
    $this->browserRequest('POST', '/api/students', studentPayload($overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->assertDatabaseCount('students', 0);
    $this->assertDatabaseCount('student_identities', 0);
})->with([
    'missing enrollment' => [['enrollment_number' => null], 'enrollment_number'],
    'blank enrollment' => [['enrollment_number' => '   '], 'enrollment_number'],
    'long enrollment' => [['enrollment_number' => str_repeat('A', 31)], 'enrollment_number'],
    'enrollment with spaces' => [['enrollment_number' => 'A 001'], 'enrollment_number'],
    'enrollment with symbols' => [['enrollment_number' => 'A001<script>'], 'enrollment_number'],
    'enrollment starting with symbol' => [['enrollment_number' => '-001'], 'enrollment_number'],
    'array enrollment' => [['enrollment_number' => ['A1']], 'enrollment_number'],
    'missing given names' => [['given_names' => null], 'given_names'],
    'blank given names' => [['given_names' => '  '], 'given_names'],
    'long given names' => [['given_names' => str_repeat('n', 121)], 'given_names'],
    'missing first surname' => [['first_surname' => null], 'first_surname'],
    'long second surname' => [['second_surname' => str_repeat('s', 121)], 'second_surname'],
    'array second surname' => [['second_surname' => ['x']], 'second_surname'],
]);

it('accepts the allowed enrollment characters up to 30', function () {
    signInInstitution($this);
    $this->browserRequest('POST', '/api/students', studentPayload(['enrollment_number' => 'ITM/2026.A-'.str_repeat('9', 19)]))->assertCreated();
});

it('only lets INSTITUTION accounts register or list students (CA-01)', function (UserRole $role) {
    Student::factory()->for($this->institution)->withIdentity()->create();
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
    $this->browserRequest('GET', '/api/students')->assertForbidden();
    $this->browserRequest('POST', '/api/students', studentPayload(['enrollment_number' => 'OTRO-1']))->assertForbidden();
    $this->assertDatabaseCount('students', 1);
})->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

it('rejects an INSTITUTION account without a linked institution', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::INSTITUTION)->create(['institution_id' => null]))->assertOk();
    $this->browserRequest('GET', '/api/students')->assertForbidden();
    $this->browserRequest('POST', '/api/students', studentPayload())->assertForbidden();
    $this->assertDatabaseCount('students', 0);
});

it('rejects anonymous requests and accounts of an inactive institution', function () {
    $this->startCookieSession();
    $this->browserRequest('GET', '/api/students')->assertUnauthorized();
    $this->browserRequest('POST', '/api/students', studentPayload())->assertUnauthorized();

    signInInstitution($this);
    $this->institution->forceFill(['is_active' => false])->save();
    $this->browserRequest('GET', '/api/students')->assertUnauthorized()->assertJsonPath('code', 'INSTITUTION_INACTIVE');
    $this->assertDatabaseCount('students', 0);
});

it('requires CSRF to register a student', function () {
    signInInstitution($this);
    $this->browserRequest('POST', '/api/students', studentPayload(), csrf: false)->assertStatus(419);
    $this->assertDatabaseCount('students', 0);
});

it('offers no physical deletion of students', function () {
    $student = Student::factory()->for($this->institution)->withIdentity()->create();
    signInInstitution($this);
    $this->browserRequest('DELETE', '/api/students')->assertStatus(405);
    $this->browserRequest('DELETE', '/api/students/'.$student->id)->assertStatus(405);
    $this->assertDatabaseHas('students', ['id' => $student->id]);
});

it('keeps the protected identity outside the public students table (CA-05)', function () {
    expect(Schema::getColumnListing('students'))->toEqualCanonicalizing(['id', 'institution_id', 'created_at', 'updated_at', 'location', 'is_active', 'headline', ...Student::PROFILE_ATTRIBUTES]);
    foreach (StudentIdentity::PROTECTED_ATTRIBUTES as $column) {
        expect(Schema::hasColumn('student_identities', $column))->toBeTrue();
        expect(Schema::hasColumn('students', $column))->toBeFalse();
    }
});

it('prevents an identity from belonging to a different institution than its student', function () {
    $student = Student::factory()->for($this->institution)->create();
    $other = Institution::factory()->create();
    expect(fn () => DB::table('student_identities')->insert([
        'student_id' => $student->id, 'institution_id' => $other->id,
        'enrollment_number' => 'X-1', 'given_names' => 'X', 'first_surname' => 'Y',
        'created_at' => now(), 'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});
