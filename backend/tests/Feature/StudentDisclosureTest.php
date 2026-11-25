<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\StudentDisclosure;
use App\Models\User;
use App\Notifications\StudentProfileShared;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// Sprint 19, PR 2: ficha compartida con la empresa tras aceptar la vinculación (T-S19-05 a T-S19-07; D1 a D5).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create(['name' => 'UT del Golfo']);
    $this->institutionAccount = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual']);
    $this->company = Company::factory()->create();
    $this->companyAccount = User::factory()->forCompany($this->company)->create(['name' => 'Reclutadora']);
    $this->student = Student::factory()->for($this->institution)->withIdentity([
        'enrollment_number' => 'MAT-SECRETA-77', 'given_names' => 'Ana Sofía', 'first_surname' => 'López', 'second_surname' => 'Ruiz',
    ])->create();
    disclosureStudentData($this->student);
    $this->opportunity = disclosureOpportunity($this->company);
    $this->linkage = disclosureLinkage($this->company, $this->opportunity, $this->student, 'ACEPTADA');
});

function disclosureOpportunity(Company $company): Opportunity
{
    $opportunity = new Opportunity([
        'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'period_number' => 5,
        'vacancies' => 3, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();

    return $opportunity->refresh();
}

function disclosureLinkage(Company $company, Opportunity $opportunity, Student $student, string $status): LinkageRequest
{
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = User::factory()->forCompany($company)->create()->id;
    $linkage->status = $status;
    if ($status !== 'PENDIENTE_INSTITUCION') {
        $linkage->responded_at = now();
        $linkage->responded_by = User::factory()->forInstitution($student->institution)->create()->id;
    }
    $linkage->save();

    return $linkage->refresh();
}

/** Enlaces, una certificación con credencial (revisada por alguien) y el seguro, para comprobar qué nunca sale. */
function disclosureStudentData(Student $student): void
{
    $owner = ['student_id' => $student->id, 'institution_id' => $student->institution_id];
    DB::table('student_links')->insert([
        [...$owner, 'kind' => 'github', 'url' => 'https://github.com/anasofia', 'position' => 1, 'created_at' => now(), 'updated_at' => now()],
        [...$owner, 'kind' => 'other', 'url' => 'ftp://archivos.example.test/cv', 'position' => 2, 'created_at' => now(), 'updated_at' => now()],
    ]);
    $reviewer = User::factory()->forInstitution($student->institution)->create(['name' => 'Revisora Interna']);
    $certification = DB::table('student_certifications')->insertGetId([...$owner, 'name' => 'AWS Cloud Practitioner', 'issuer' => 'AWS', 'issuer_slug' => 'aws',
        'issued_on' => '2026-01-10', 'verified_at' => now(), 'verified_by' => $reviewer->id, 'position' => 1, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('student_certification_credentials')->insert([...$owner, 'certification_id' => $certification, 'credential_id' => 'AWS-123',
        'credential_url' => 'https://aws.example.test/verify/AWS-123', 'verifiable' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('student_social_security')->insert([...$owner, 'insurance_type' => 'OTHER', 'insurer_name' => 'Aseguradora Secreta',
        'policy_number' => encrypt('POL-SECRETA'), 'created_at' => now(), 'updated_at' => now()]);
}

function shareProfile($test, LinkageRequest $linkage, array $data = [])
{
    return $test->browserRequest('POST', "/api/institution/linkage-requests/{$linkage->id}/disclosure", array_replace(['fields' => ['full_name', 'links'], 'consent' => true], $data));
}

describe('compartir la ficha (T-S19-05)', function () {
    it('shares only the chosen whitelisted groups, live, and the institution sees who and when', function () {
        Notification::fake();
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        shareProfile($this, $this->linkage)->assertCreated()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.fields', ['full_name', 'links'])->assertJsonPath('data.disclosed_by.name', 'Coordinación Dual');
        $this->browserRequest('GET', "/api/institution/linkage-requests/{$this->linkage->id}")->assertOk()
            ->assertJsonPath('data.disclosure.fields', ['full_name', 'links']);
        $disclosure = StudentDisclosure::query()->sole();
        expect($disclosure->consent_confirmed_at)->not->toBeNull()->and($disclosure->company_id)->toBe($this->company->id);

        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}")->assertOk()
            ->assertJsonPath('data.shared_profile_at', $disclosure->disclosed_at->toISOString());
        $response = $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');

        expect(array_keys($response->json('data')))->toBe(['fields', 'disclosed_at', 'full_name', 'links'])
            ->and($response->json('data.full_name'))->toBe('Ana Sofía López Ruiz')
            // Solo http(s): el enlace ftp no sale.
            ->and($response->json('data.links'))->toBe([['kind' => 'github', 'url' => 'https://github.com/anasofia']]);
        expect($response->getContent())->not->toContain('MAT-SECRETA-77', 'Aseguradora Secreta', 'POL-SECRETA', 'Revisora Interna', 'AWS-123', '"id"', 'location', 'enrollment');

        // En vivo: una corrección de la institución se ve sin volver a compartir.
        DB::table('student_identities')->where('student_id', $this->student->id)->update(['second_surname' => 'Ríos']);
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertJsonPath('data.full_name', 'Ana Sofía López Ríos');
    });

    it('shares the certification credentials without who reviewed them', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage, ['fields' => ['credentials']])->assertCreated();
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $response = $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertOk();
        expect(array_keys($response->json('data')))->toBe(['fields', 'disclosed_at', 'credentials'])
            ->and($response->json('data.credentials'))->toBe([['name' => 'AWS Cloud Practitioner', 'issuer' => 'AWS', 'credential_id' => 'AWS-123', 'credential_url' => 'https://aws.example.test/verify/AWS-123']]);
        expect($response->getContent())->not->toContain('Revisora Interna', 'verified', 'Ana Sofía', 'github');
    });

    it('requires the consent and only accepts whitelisted groups (D2, D3)', function (array $data, string $error) {
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        shareProfile($this, $this->linkage, $data)->assertUnprocessable()->assertJsonValidationErrors($error);
        expect(StudentDisclosure::query()->count())->toBe(0);
    })->with([
        'sin consentimiento' => [['consent' => false], 'consent'],
        'sin grupos' => [['fields' => []], 'fields'],
        'matrícula' => [['fields' => ['enrollment_number']], 'fields.0'],
        'seguro' => [['fields' => ['full_name', 'social_security']], 'fields.1'],
        'repetido' => [['fields' => ['links', 'links']], 'fields.0'],
        'campo extra' => [['student_id' => 1], 'student_id'],
    ]);

    it('the database rejects a group outside the whitelist even without the API', function () {
        expect(fn () => DB::transaction(fn () => DB::table('student_disclosures')->insert([
            'linkage_request_id' => $this->linkage->id, 'institution_id' => $this->institution->id, 'company_id' => $this->company->id,
            'student_id' => $this->student->id, 'fields' => json_encode(['nss']), 'consent_confirmed_at' => now(),
            'disclosed_by' => $this->institutionAccount->id, 'disclosed_at' => now(),
        ])))->toThrow(QueryException::class);
    });

    it('only shares an accepted linkage of the own institution', function (string $status) {
        $linkage = disclosureLinkage($this->company, $this->opportunity, Student::factory()->for($this->institution)->withIdentity()->create(), $status);
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        shareProfile($this, $linkage)->assertUnprocessable()->assertJsonValidationErrors('status');
    })->with(['PENDIENTE_INSTITUCION', 'RECHAZADA', 'CANCELADA']);

    it('answers 404 for a linkage of another institution or company', function () {
        $other = User::factory()->forInstitution(Institution::factory()->create())->create();
        $this->loginWithCookies($other)->assertOk();
        shareProfile($this, $this->linkage)->assertNotFound();

        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage)->assertCreated();
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies(User::factory()->forCompany(Company::factory()->create())->create())->assertOk();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertNotFound();
    });

    it('is not available to the company before it is shared', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertNotFound();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}")->assertJsonPath('data.shared_profile_at', null);
    });
});

describe('dejar de compartir (T-S19-05, D4)', function () {
    it('removes the company access at once, keeps the linkage and allows sharing again', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage)->assertCreated();
        shareProfile($this, $this->linkage)->assertUnprocessable()->assertJsonPath('errors.fields.0', 'La ficha ya está compartida. Deja de compartirla para elegir otros datos.');

        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/disclosure/revoke")->assertOk();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/disclosure/revoke")->assertUnprocessable();
        $this->browserRequest('GET', "/api/institution/linkage-requests/{$this->linkage->id}")->assertJsonPath('data.disclosure', null)->assertJsonPath('data.status', 'ACEPTADA');
        expect(StudentDisclosure::query()->sole())->revoked_reason->toBe('institution')->revoked_by->toBe($this->institutionAccount->id);

        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertNotFound();

        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage, ['fields' => ['links']])->assertCreated();
        expect(StudentDisclosure::query()->count())->toBe(2);
    });

    it('is revoked automatically when the linkage is terminated', function (string $side) {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage)->assertCreated();
        $account = $side === 'institution' ? $this->institutionAccount : $this->companyAccount;
        $path = $side === 'institution' ? '/api/institution/linkage-requests/' : '/api/linkage-requests/';
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($account)->assertOk();

        $this->browserRequest('PATCH', $path.$this->linkage->id.'/termination', ['reason' => 'El alumno no se presentó.'])->assertOk();

        expect(StudentDisclosure::query()->sole())->revoked_reason->toBe('termination')->revoked_by->toBe($account->id);
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/disclosure")->assertNotFound();
    })->with(['institution', 'company']);

    it('keeps the history append-only: nothing but one revocation can change', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage)->assertCreated();
        $id = StudentDisclosure::query()->sole()->id;

        // Cada intento en su propio punto de guardado, para que el error no aborte la transacción de la prueba.
        expect(fn () => DB::transaction(fn () => DB::table('student_disclosures')->where('id', $id)->update(['fields' => json_encode(['full_name', 'links', 'credentials'])])))->toThrow(QueryException::class);
        expect(fn () => DB::transaction(fn () => DB::table('student_disclosures')->where('id', $id)->delete()))->toThrow(QueryException::class);
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/disclosure/revoke")->assertOk();
        expect(fn () => DB::transaction(fn () => DB::table('student_disclosures')->where('id', $id)->update(['revoked_reason' => 'termination'])))->toThrow(QueryException::class);
    });
});

describe('aviso y bitácora (T-S19-05, T-S19-07)', function () {
    it('emails the active company accounts when shared, and nothing when it stops (D5)', function () {
        Notification::fake();
        $pending = User::factory()->forCompany($this->company)->create(['password_setup_required' => true]);
        $inactive = User::factory()->forCompany($this->company)->inactive()->create();
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        shareProfile($this, $this->linkage)->assertCreated();
        Notification::assertSentTo($this->companyAccount, StudentProfileShared::class, function (StudentProfileShared $notice) {
            $mail = $notice->toMail($this->companyAccount);
            $text = implode(' ', [$mail->subject, ...$mail->introLines, ...$mail->outroLines]);

            return $notice->detailUrl === rtrim(config('app.frontend_url'), '/')."/linkage-requests/{$this->linkage->id}"
                && str_contains($text, 'UT del Golfo') && ! str_contains($text, 'Ana Sofía') && ! str_contains($text, 'github');
        });
        Notification::assertNotSentTo([$pending, $inactive], StudentProfileShared::class);

        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/disclosure/revoke")->assertOk();
        // Un solo aviso por cuenta activa (al compartir); dejar de compartir no envía nada.
        Notification::assertSentToTimes($this->companyAccount, StudentProfileShared::class, 1);
        $active = User::query()->where('company_id', $this->company->id)->where('is_active', true)->where('password_setup_required', false)->count();
        Notification::assertSentTimes(StudentProfileShared::class, $active);
    });

    it('lists sharing and revocation in the audit log with the groups and never the student', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        shareProfile($this, $this->linkage)->assertCreated();
        $this->travel(1)->minutes();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/disclosure/revoke")->assertOk();
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $revoked = $this->browserRequest('GET', '/api/audit-events?type=student_disclosure_revoked')->assertOk();
        expect($revoked->json('data.0.resource'))->toMatchArray(['id' => $this->linkage->id, 'status' => 'ACEPTADA', 'fields' => ['full_name', 'links'], 'reason' => 'institution'])
            ->and($revoked->json('data.0.actor.name'))->toBe('Coordinación Dual');
        $shared = $this->browserRequest('GET', '/api/audit-events?type=student_disclosed')->assertOk();
        expect($shared->json('data.0.resource.reason'))->toBeNull();
        expect($shared->getContent().$revoked->getContent())->not->toContain('Ana Sofía', 'MAT-SECRETA-77', 'github');
    });
});
