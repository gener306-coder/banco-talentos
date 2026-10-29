<?php

use App\Models\Institution;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S8-01: búsqueda y filtro del padrón de alumnos.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
});

function searchStudent(Institution $institution, string $enrollment, string $given, string $first, ?string $second = null, bool $active = true): Student
{
    return tap(Student::factory()->for($institution)->withIdentity([
        'enrollment_number' => $enrollment, 'given_names' => $given, 'first_surname' => $first, 'second_surname' => $second,
    ])->create(), fn (Student $student) => $active || $student->forceFill(['is_active' => false])->save());
}

function searchRoster($test, string $query = ''): array
{
    return $test->browserRequest('GET', '/api/students'.$query)->assertOk()->json();
}

function searchEnrollments(array $body): array
{
    return array_column($body['data'], 'enrollment_number');
}

it('searches by enrollment, given names and either surname, case-insensitively (CA-01)', function (string $query, array $expected) {
    searchStudent($this->institution, 'UT-2026-001', 'Ana Sofía', 'López', 'Ríos');
    searchStudent($this->institution, 'UT-2026-002', 'Bruno', 'Méndez', 'López');
    searchStudent($this->institution, 'IT-0099', 'Carla', 'Zamora');
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    expect(searchEnrollments(searchRoster($this, '?q='.urlencode($query))))->toBe($expected);
})->with([
    'enrollment fragment' => ['2026', ['UT-2026-001', 'UT-2026-002']],
    'enrollment in lowercase' => ['it-0099', ['IT-0099']],
    'given name' => ['bruno', ['UT-2026-002']],
    'first or second surname' => ['LÓPEZ', ['UT-2026-001', 'UT-2026-002']],
    'several words across fields' => ['ana lópez', ['UT-2026-001']],
    'words in any order' => ['ríos sofía', ['UT-2026-001']],
    'no match' => ['inexistente', []],
    'surrounding spaces' => ['  carla  ', ['IT-0099']],
]);

it('treats % and _ literally (CA-01)', function () {
    searchStudent($this->institution, 'A_1', 'Uno', 'Pérez');
    searchStudent($this->institution, 'AB1', 'Dos', 'Pérez');
    searchStudent($this->institution, 'C%9', 'Tres', 'Pérez');
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    expect(searchEnrollments(searchRoster($this, '?q='.urlencode('a_1'))))->toBe(['A_1'])
        ->and(searchEnrollments(searchRoster($this, '?q='.urlencode('%'))))->toBe(['C%9']);
});

it('filters by status and combines it with the search (CA-01)', function () {
    searchStudent($this->institution, 'ACT-1', 'Ana', 'López');
    searchStudent($this->institution, 'INA-1', 'Ana', 'Luna', active: false);
    searchStudent($this->institution, 'ACT-2', 'Beto', 'Mora');
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    expect(searchEnrollments(searchRoster($this, '?status=active')))->toBe(['ACT-1', 'ACT-2'])
        ->and(searchEnrollments(searchRoster($this, '?status=inactive')))->toBe(['INA-1'])
        ->and(searchEnrollments(searchRoster($this, '?status=active&q=ana')))->toBe(['ACT-1'])
        ->and(searchEnrollments(searchRoster($this, '?q=ana')))->toBe(['ACT-1', 'INA-1']);
});

it('never returns students of another institution, even when they match (CA-02)', function () {
    searchStudent($this->institution, 'PROPIO-1', 'Ana', 'López');
    searchStudent(Institution::factory()->create(), 'AJENO-1', 'Ana', 'López');
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    $body = searchRoster($this, '?q=ana&status=active');
    expect(searchEnrollments($body))->toBe(['PROPIO-1'])->and($body['meta']['total'])->toBe(1);
});

it('keeps the order by surnames and paginates the filtered results in pages of 50 (CA-02)', function () {
    foreach (range(1, 55) as $n) {
        searchStudent($this->institution, sprintf('BUS-%03d', $n), 'Ana', sprintf('Apellido%03d', 56 - $n));
    }
    searchStudent($this->institution, 'OTRO-1', 'Beto', 'Aaa');
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    $first = searchRoster($this, '?q=bus');
    expect($first['meta'])->toBe(['current_page' => 1, 'last_page' => 2, 'total' => 55])
        ->and($first['data'])->toHaveCount(50)
        ->and($first['data'][0]['enrollment_number'])->toBe('BUS-055');
    expect(searchEnrollments(searchRoster($this, '?q=bus&page=2')))->toBe(['BUS-005', 'BUS-004', 'BUS-003', 'BUS-002', 'BUS-001']);
});

it('validates the search parameters (CA-01)', function (string $query, string $field) {
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    $this->browserRequest('GET', '/api/students'.$query)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'status out of the list' => ['?status=ACTIVO', 'status'],
    'status as array' => ['?status[]=active', 'status'],
    'query as array' => ['?q[]=ana', 'q'],
    'query too long' => ['?q='.str_repeat('a', 101), 'q'],
    'page zero' => ['?page=0', 'page'],
]);

it('accepts a search of exactly 100 characters and a blank one (CA-01)', function () {
    searchStudent($this->institution, 'UNO-1', 'Ana', 'López');
    $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();

    expect(searchRoster($this, '?q='.str_repeat('a', 100))['data'])->toBe([])
        ->and(searchEnrollments(searchRoster($this, '?q=')))->toBe(['UNO-1']);
});

it('indexes students by institution and status (CA-05)', function () {
    $definition = DB::table('pg_indexes')->where('indexname', 'students_institution_active_index')->value('indexdef');

    expect($definition)->toContain('(institution_id, is_active)');
});
