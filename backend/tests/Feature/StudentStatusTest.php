<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->student = Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'A2026-001'])->create();
    $this->foreign = Student::factory()->for(Institution::factory())->withIdentity(['enrollment_number' => 'AJENO-1'])->create();
});

function statusUrl(Student|int $student): string
{
    return '/api/students/'.($student instanceof Student ? $student->id : $student).'/status';
}

function signInStatusInstitution($test): void
{
    $test->loginWithCookies($test->account)->assertOk();
}

it('stores the state as a boolean column that defaults to active (CA-01)', function () {
    expect(Schema::getColumnType('students', 'is_active'))->toBe('bool');
    $id = DB::table('students')->insertGetId(['institution_id' => $this->institution->id, 'created_at' => now(), 'updated_at' => now()]);
    expect(DB::table('students')->where('id', $id)->value('is_active'))->toBeTrue();
    expect($this->student->fresh()->is_active)->toBeTrue();
});

it('registers new students as active and shows the state in the roster and the detail (CA-01)', function () {
    signInStatusInstitution($this);
    $this->browserRequest('POST', '/api/students', [
        'enrollment_number' => 'NUEVO-1', 'given_names' => 'Luis', 'first_surname' => 'Báez',
    ])->assertCreated()->assertJsonPath('data.is_active', true);

    $this->browserRequest('GET', '/api/students')->assertOk()->assertJsonPath('data.0.is_active', true);
    $this->browserRequest('GET', '/api/students/'.$this->student->id)->assertOk()->assertJsonPath('data.is_active', true);
});

it('inactivates and reactivates an own student without losing its record (CA-02, CA-03)', function () {
    signInStatusInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', [
        'program' => 'Mecatrónica', 'period_type' => 'semester', 'period_number' => 5, 'dual_available' => true,
        'state_code' => '28', 'municipality' => 'Victoria', 'can_relocate' => false,
    ])->assertOk();

    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false])
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('data.id', $this->student->id)
        ->assertJsonPath('data.is_active', false)
        ->assertJsonPath('data.enrollment_number', 'A2026-001')
        ->assertJsonPath('data.profile.program', 'Mecatrónica');
    expect($this->student->fresh()->is_active)->toBeFalse();

    // Sigue en el padrón de su institución: la baja es lógica.
    $this->browserRequest('GET', '/api/students')->assertOk()
        ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.is_active', false);

    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => true])
        ->assertOk()->assertJsonPath('data.is_active', true);
    expect($this->student->fresh()->is_active)->toBeTrue();
});

it('is idempotent when the state does not change', function () {
    signInStatusInstitution($this);
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => true])->assertOk()->assertJsonPath('data.is_active', true);
});

it('lets an inactive student keep being edited by its institution', function () {
    $this->student->forceFill(['is_active' => false])->save();
    signInStatusInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', [
        'enrollment_number' => 'A2026-002', 'given_names' => 'Ana', 'first_surname' => 'Ruiz',
    ])->assertOk()->assertJsonPath('data.is_active', false)->assertJsonPath('data.enrollment_number', 'A2026-002');
});

it('validates the state strictly without writing it', function (mixed $value) {
    signInStatusInstitution($this);
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => $value])
        ->assertUnprocessable()->assertJsonValidationErrors('is_active');
    expect($this->student->fresh()->is_active)->toBeTrue();
})->with([
    'missing' => [null],
    'string false' => ['false'],
    'string zero' => ['0'],
    'integer zero' => [0],
    'integer one' => [1],
    'text' => ['inactivo'],
]);

it('only changes the state through the status action', function (string $field, mixed $value) {
    signInStatusInstitution($this);
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false, $field => $value])
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field => 'La acción de cambio de estado solo permite modificar is_active.']);
    expect($this->student->fresh()->is_active)->toBeTrue();
})->with([
    'program' => ['program', 'Otra'],
    'enrollment' => ['enrollment_number', 'X-1'],
    'given names' => ['given_names', 'Otro'],
    'institution' => ['institution_id', 1],
]);

it('never changes the state through the profile or the identity', function () {
    signInStatusInstitution($this);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/profile', [
        'program' => 'Mecatrónica', 'period_type' => 'semester', 'period_number' => 5, 'dual_available' => true,
        'state_code' => '28', 'municipality' => 'Victoria', 'can_relocate' => false, 'is_active' => false,
    ])->assertOk()->assertJsonPath('data.is_active', true);
    $this->browserRequest('PUT', '/api/students/'.$this->student->id.'/identity', [
        'enrollment_number' => 'A2026-001', 'given_names' => 'Ana', 'first_surname' => 'Ruiz', 'is_active' => false,
    ])->assertOk()->assertJsonPath('data.is_active', true);
    $this->browserRequest('POST', '/api/students', [
        'enrollment_number' => 'NUEVO-2', 'given_names' => 'Luis', 'first_surname' => 'Báez', 'is_active' => false,
    ])->assertCreated()->assertJsonPath('data.is_active', true);
    expect($this->student->fresh()->is_active)->toBeTrue();
});

it('answers 404 for a student of another institution or a missing one, without writing (CA-04)', function () {
    signInStatusInstitution($this);
    foreach ([$this->foreign->id, Student::max('id') + 100] as $id) {
        $this->browserRequest('PATCH', statusUrl($id), ['is_active' => false])
            ->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
    }
    expect($this->foreign->fresh()->is_active)->toBeTrue();
});

it('answers 404 for malformed or out of range identifiers', function (string $id) {
    signInStatusInstitution($this);
    $this->browserRequest('PATCH', '/api/students/'.$id.'/status', ['is_active' => false])->assertNotFound();
})->with(['zero' => ['0'], 'negative' => ['-1'], 'text' => ['abc'], 'bigint overflow' => ['99999999999999999999'], 'leading zero' => ['01']]);

it('only lets INSTITUTION accounts change the state', function (UserRole $role) {
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false])->assertForbidden();
    expect($this->student->fresh()->is_active)->toBeTrue();
})->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

it('rejects anonymous requests, accounts without institution and inactive institutions', function () {
    $this->startCookieSession();
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false])->assertUnauthorized();

    $this->loginWithCookies(User::factory()->role(UserRole::INSTITUTION)->create(['institution_id' => null]))->assertOk();
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false])->assertForbidden();

    $this->initializeCookieBrowser();
    signInStatusInstitution($this);
    $this->institution->forceFill(['is_active' => false])->save();
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false])->assertUnauthorized();

    expect($this->student->fresh()->is_active)->toBeTrue();
});

it('requires CSRF to change the state', function () {
    signInStatusInstitution($this);
    $this->browserRequest('PATCH', statusUrl($this->student), ['is_active' => false], csrf: false)->assertStatus(419);
    expect($this->student->fresh()->is_active)->toBeTrue();
});

it('offers no physical deletion of students in any route (CA-03)', function () {
    signInStatusInstitution($this);
    foreach (['/api/students', '/api/students/'.$this->student->id, statusUrl($this->student)] as $url) {
        $this->browserRequest('DELETE', $url)->assertStatus(405);
    }
    $this->assertDatabaseHas('students', ['id' => $this->student->id]);
    $this->assertDatabaseHas('student_identities', ['student_id' => $this->student->id]);
});
