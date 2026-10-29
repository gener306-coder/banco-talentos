<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S7-03: bitácora de trazabilidad para ADMIN.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

afterEach(function () {
    Carbon::setTestNow();
});

/** Ejecuta $create con el reloj fijo en $moment (UTC). */
function auditAt(string $moment, Closure $create): mixed
{
    Carbon::setTestNow($moment);

    return tap($create(), fn () => Carbon::setTestNow());
}

function auditAccount(User $creator, UserRole $role = UserRole::SECRETARY, array $values = []): User
{
    return tap(User::factory()->role($role)->create($values), fn (User $user) => $user->forceFill(['created_by' => $creator->id])->save());
}

function auditOpportunity(Company $company, User $creator, string $title = 'Tableros de producción'): Opportunity
{
    $opportunity = new Opportunity([
        'title' => $title, 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = $creator->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();

    return $opportunity;
}

function auditLinkage(Opportunity $opportunity, Student $student, User $requester): LinkageRequest
{
    $linkage = new LinkageRequest;
    $linkage->company_id = $opportunity->company_id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = $requester->id;
    $linkage->save();

    return $linkage;
}

function auditEvents($test, string $query = '')
{
    return $test->browserRequest('GET', '/api/audit-events'.$query);
}

function auditAdmin(): User
{
    return User::factory()->role(UserRole::ADMIN)->create(['name' => 'Administración General']);
}

it('rejects visitors (CA-01)', function () {
    auditEvents($this)->assertUnauthorized();
});

it('allows only ADMIN (CA-01)', function (UserRole $role) {
    $user = match ($role) {
        UserRole::INSTITUTION => User::factory()->forInstitution(Institution::factory()->create())->create(),
        UserRole::COMPANY => User::factory()->forCompany()->create(),
        default => User::factory()->role($role)->create(),
    };
    $this->loginWithCookies($user)->assertOk();

    auditEvents($this)->assertForbidden();
})->with([UserRole::SECRETARY, UserRole::INSTITUTION, UserRole::COMPANY]);

it('rejects an ADMIN deactivated after logging in (CA-01)', function () {
    $admin = auditAdmin();
    $this->loginWithCookies($admin)->assertOk();
    $admin->forceFill(['is_active' => false])->save();

    auditEvents($this)->assertUnauthorized();
});

it('returns an empty first page without traceable events (CA-02)', function () {
    $this->loginWithCookies(auditAdmin())->assertOk();

    auditEvents($this)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
        ->assertExactJson(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'total' => 0, 'per_page' => 30]]);
});

it('lists every traceable event newest first with only public fields (CA-02, CA-03)', function () {
    $admin = auditAdmin();
    $secretary = auditAt('2026-10-01 10:00:00', fn () => auditAccount($admin, UserRole::SECRETARY, ['name' => 'Analista Económica', 'email' => 'analista@economia.test']));
    $company = auditAt('2026-10-02 10:00:00', fn () => Company::factory()->create(['legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'trade_name' => 'ManuGolfo', 'registered_by' => $secretary->id]));
    $recruiter = auditAt('2026-10-03 10:00:00', fn () => tap(User::factory()->forCompany($company)->create(['name' => 'Reclutadora', 'email' => 'rh@manugolfo.test']),
        fn (User $user) => $user->forceFill(['created_by' => $secretary->id])->save()));
    $opportunity = auditAt('2026-10-04 10:00:00', fn () => auditOpportunity($company, $recruiter));
    $institution = Institution::factory()->create(['name' => 'Universidad Tecnológica']);
    $coordinator = User::factory()->forInstitution($institution)->create(['name' => 'Coordinación Dual']);
    $student = Student::factory()->for($institution)->withIdentity(['enrollment_number' => 'MAT2026X', 'given_names' => 'Ximena', 'first_surname' => 'Zaragoza'])->create();
    $linkage = auditAt('2026-10-05 10:00:00', fn () => auditLinkage($opportunity, $student, $recruiter));
    $linkage->forceFill(['status' => 'ACEPTADA', 'responded_by' => $coordinator->id, 'responded_at' => '2026-10-06 10:00:00', 'response_message' => 'Coordinemos.'])->save();
    DB::table('student_social_security')->insert(['student_id' => $student->id, 'institution_id' => $institution->id,
        'nss' => encrypt('12345678903', false), 'nss_hash' => str_repeat('a', 64), 'created_at' => now(), 'updated_at' => now()]);

    $this->loginWithCookies($admin)->assertOk();
    $response = auditEvents($this)->assertOk();

    expect($response->json('data'))->toBe([
        ['type' => 'linkage_responded', 'occurred_at' => '2026-10-06T10:00:00.000000Z',
            'actor' => ['id' => $coordinator->id, 'name' => 'Coordinación Dual', 'role' => 'INSTITUTION'],
            'resource' => ['id' => $linkage->id, 'status' => 'ACEPTADA', 'institution' => 'Universidad Tecnológica', 'company' => 'ManuGolfo']],
        ['type' => 'linkage_requested', 'occurred_at' => '2026-10-05T10:00:00.000000Z',
            'actor' => ['id' => $recruiter->id, 'name' => 'Reclutadora', 'role' => 'COMPANY'],
            'resource' => ['id' => $linkage->id, 'status' => 'ACEPTADA', 'institution' => 'Universidad Tecnológica', 'company' => 'ManuGolfo']],
        ['type' => 'opportunity_created', 'occurred_at' => '2026-10-04T10:00:00.000000Z',
            'actor' => ['id' => $recruiter->id, 'name' => 'Reclutadora', 'role' => 'COMPANY'],
            'resource' => ['id' => $opportunity->id, 'title' => 'Tableros de producción']],
        ['type' => 'account_created', 'occurred_at' => '2026-10-03T10:00:00.000000Z',
            'actor' => ['id' => $secretary->id, 'name' => 'Analista Económica', 'role' => 'SECRETARY'],
            'resource' => ['id' => $recruiter->id, 'name' => 'Reclutadora', 'email' => 'rh@manugolfo.test', 'role' => 'COMPANY']],
        ['type' => 'company_registered', 'occurred_at' => '2026-10-02T10:00:00.000000Z',
            'actor' => ['id' => $secretary->id, 'name' => 'Analista Económica', 'role' => 'SECRETARY'],
            'resource' => ['id' => $company->id, 'legal_name' => 'Manufacturas del Golfo, S.A. de C.V.']],
        ['type' => 'account_created', 'occurred_at' => '2026-10-01T10:00:00.000000Z',
            'actor' => ['id' => $admin->id, 'name' => 'Administración General', 'role' => 'ADMIN'],
            'resource' => ['id' => $secretary->id, 'name' => 'Analista Económica', 'email' => 'analista@economia.test', 'role' => 'SECRETARY']],
    ]);

    $body = $response->getContent();
    foreach (['MAT2026X', 'Ximena', 'Zaragoza', $student->fresh()->public_id, 'student', 'password', 'token', 'nss', str_repeat('a', 64),
        'Coordinemos', DB::table('users')->where('id', $admin->id)->value('password'), 'location'] as $secret) {
        expect($body)->not->toContain($secret);
    }
});

it('filters by event type and validates it (CA-02)', function (string $type, int $count) {
    $admin = auditAdmin();
    $secretary = auditAccount($admin);
    $company = Company::factory()->create(['registered_by' => $secretary->id]);
    $recruiter = User::factory()->forCompany($company)->create();
    $institution = Institution::factory()->create();
    $student = Student::factory()->for($institution)->withIdentity()->create();
    $linkage = auditLinkage(auditOpportunity($company, $recruiter), $student, $recruiter);
    auditLinkage(auditOpportunity($company, $recruiter, 'Calidad'), $student, $recruiter);
    $linkage->forceFill(['status' => 'RECHAZADA', 'responded_by' => User::factory()->forInstitution($institution)->create()->id, 'responded_at' => now()])->save();
    $this->loginWithCookies($admin)->assertOk();

    $response = auditEvents($this, '?type='.$type)->assertOk()->assertJsonPath('meta.total', $count);
    expect(collect($response->json('data'))->pluck('type')->unique()->all())->toBe([$type]);
})->with([
    ['account_created', 1],
    ['company_registered', 1],
    ['opportunity_created', 2],
    ['linkage_requested', 2],
    ['linkage_responded', 1],
]);

it('rejects an unknown event type (CA-02)', function (string $query) {
    $this->loginWithCookies(auditAdmin())->assertOk();

    auditEvents($this, $query)->assertUnprocessable();
})->with(['?type=password_changed', '?type=ACCOUNT_CREATED', '?type[]=account_created', '?page=0']);

it('paginates 30 events per page, newest first (CA-02)', function () {
    $admin = auditAdmin();
    foreach (range(1, 31) as $day) {
        auditAt(sprintf('2026-08-%02d 12:00:00', min($day, 31)), fn () => auditAccount($admin, UserRole::SECRETARY, ['email' => "cuenta{$day}@economia.test"]));
    }
    $this->loginWithCookies($admin)->assertOk();

    $first = auditEvents($this)->assertOk()->assertJsonPath('meta.total', 31)->assertJsonPath('meta.last_page', 2);
    expect($first->json('data'))->toHaveCount(30)->and($first->json('data.0.resource.email'))->toBe('cuenta31@economia.test');
    expect(auditEvents($this, '?page=2')->assertOk()->json('data.*.resource.email'))->toBe(['cuenta1@economia.test']);
});
