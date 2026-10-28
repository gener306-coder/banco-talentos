<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Municipality;
use App\Models\Opportunity;
use App\Models\Skill;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S6-01: bandeja institucional de solicitudes de vinculación con la identidad interna del alumno.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->company = Company::factory()->create(['legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'trade_name' => 'ManuGolfo',
        'contact_name' => 'Laura Méndez', 'contact_email' => 'dual@manugolfo.mx', 'contact_phone' => '8331234567']);
    $this->student = receivedStudent($this->institution, ['enrollment_number' => 'MAT-0001', 'given_names' => 'Ana Sofía',
        'first_surname' => 'García', 'second_surname' => 'López']);
    $this->opportunity = receivedOpportunity($this->company, 'Tableros de producción');
});

/** Alumno con identidad y expediente capturados. */
function receivedStudent(Institution $institution, array $identity = []): Student
{
    $student = Student::factory()->for($institution)->withIdentity($identity)->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false,
    ]);

    return $student->fresh();
}

function receivedOpportunity(Company $company, string $title): Opportunity
{
    $opportunity = new Opportunity([
        'title' => $title, 'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => true, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
        'language_code' => 'en', 'min_level' => 3,
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();

    return $opportunity->refresh();
}

/** Solicitud guardada directamente, como la deja HU-S5-04. */
function receivedLinkage(Company $company, Opportunity $opportunity, Student $student, string $status = 'PENDIENTE_INSTITUCION'): LinkageRequest
{
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = User::factory()->forCompany($company)->create()->id;
    $linkage->status = $status;
    $linkage->save();

    return $linkage->refresh();
}

function receivedSocialSecurity(Student $student, bool $nss, bool $document): void
{
    DB::table('student_social_security')->insert([
        'student_id' => $student->id, 'institution_id' => $student->institution_id,
        'nss' => $nss ? encrypt('12345678903', false) : null, 'nss_hash' => $nss ? str_repeat('a', 64) : null,
        'document_path' => $document ? 'social-security/secreto.pdf' : null, 'document_sha256' => $document ? str_repeat('b', 64) : null,
        'document_name' => $document ? 'vigencia.pdf' : null, 'created_at' => now(), 'updated_at' => now(),
    ]);
}

describe('acceso (CA-01)', function () {
    it('rejects visitors', function () {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student);
        $this->startCookieSession();

        $this->browserRequest('GET', '/api/institution/linkage-requests')->assertUnauthorized();
        $this->browserRequest('GET', '/api/institution/linkage-requests/'.$linkage->id)->assertUnauthorized();
    });

    it('forbids every other role', function (UserRole $role) {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student);
        $user = $role === UserRole::COMPANY ? User::factory()->forCompany($this->company)->create() : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('GET', '/api/institution/linkage-requests')->assertForbidden();
        $this->browserRequest('GET', '/api/institution/linkage-requests/'.$linkage->id)->assertForbidden();
    })->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

    it('rejects the accounts of an inactive institution with INSTITUTION_INACTIVE', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $this->institution->forceFill(['is_active' => false])->save();

        $this->browserRequest('GET', '/api/institution/linkage-requests')->assertUnauthorized()->assertJsonPath('code', 'INSTITUTION_INACTIVE');
    });
});

describe('bandeja (CA-02, CA-03, CA-04)', function () {
    it('lists only the requests for its own students, newest first, 20 per page', function () {
        $start = now()->subDays(30);
        foreach (range(1, 21) as $i) {
            $this->travelTo($start->copy()->addDays($i));
            receivedLinkage($this->company, receivedOpportunity($this->company, "Oportunidad $i"), $this->student);
        }
        $this->travelBack();
        $foreignStudent = receivedStudent(Institution::factory()->create());
        receivedLinkage($this->company, receivedOpportunity($this->company, 'Ajena'), $foreignStudent);
        $this->loginWithCookies($this->account)->assertOk();

        $first = $this->browserRequest('GET', '/api/institution/linkage-requests')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        expect(array_column(array_column($first->json('data'), 'opportunity'), 'title'))->toBe(array_map(fn (int $i): string => "Oportunidad $i", range(21, 2)))
            ->and($first->json('meta'))->toBe(['current_page' => 1, 'last_page' => 2, 'total' => 21, 'per_page' => 20]);
        $second = $this->browserRequest('GET', '/api/institution/linkage-requests?page=2')->assertOk();
        expect(array_column(array_column($second->json('data'), 'opportunity'), 'title'))->toBe(['Oportunidad 1']);
    });

    it('breaks created_at ties by id', function () {
        $this->travelTo(now()->startOfMinute());
        $older = receivedLinkage($this->company, $this->opportunity, $this->student);
        $newer = receivedLinkage($this->company, receivedOpportunity($this->company, 'B'), $this->student);
        $this->travelBack();
        $this->loginWithCookies($this->account)->assertOk();

        expect(array_column($this->browserRequest('GET', '/api/institution/linkage-requests')->json('data'), 'id'))->toBe([$newer->id, $older->id]);
    });

    it('returns the internal student identity with the company and opportunity summaries', function () {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student);
        receivedSocialSecurity($this->student, nss: true, document: true);
        $this->loginWithCookies($this->account)->assertOk();

        $response = $this->browserRequest('GET', '/api/institution/linkage-requests')->assertOk();
        expect($response->json('data'))->toBe([[
            'id' => $linkage->id,
            'status' => 'PENDIENTE_INSTITUCION',
            'created_at' => $linkage->created_at->toISOString(),
            'company' => ['name' => 'ManuGolfo', 'municipality' => Municipality::query()->find('28041')->name],
            'opportunity' => ['id' => $this->opportunity->id, 'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'vacancies' => 2],
            'student' => [
                'id' => $this->student->id, 'enrollment_number' => 'MAT-0001', 'given_names' => 'Ana Sofía', 'first_surname' => 'García',
                'second_surname' => 'López', 'is_active' => true, 'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6,
            ],
        ]]);
        expect($response->getContent())->not->toContain('12345678903')->not->toContain('secreto.pdf')->not->toContain('location');
    });

    it('uses the legal name when the company has no trade name', function () {
        $this->company->forceFill(['trade_name' => null])->save();
        receivedLinkage($this->company, $this->opportunity, $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('GET', '/api/institution/linkage-requests')->assertOk()
            ->assertJsonPath('data.0.company.name', 'Manufacturas del Golfo, S.A. de C.V.');
    });

    it('filters by status', function (string $status, int $count) {
        receivedLinkage($this->company, $this->opportunity, $this->student, 'PENDIENTE_INSTITUCION');
        receivedLinkage($this->company, receivedOpportunity($this->company, 'B'), $this->student, 'CANCELADA');
        receivedLinkage($this->company, receivedOpportunity($this->company, 'C'), $this->student, 'ACEPTADA');
        $this->loginWithCookies($this->account)->assertOk();

        $response = $this->browserRequest('GET', '/api/institution/linkage-requests?status='.$status)->assertOk();
        expect($response->json('meta.total'))->toBe($count)
            ->and(array_unique(array_column($response->json('data'), 'status')))->toBe($count ? [$status] : []);
    })->with([['PENDIENTE_INSTITUCION', 1], ['ACEPTADA', 1], ['RECHAZADA', 0], ['CANCELADA', 1]]);

    it('rejects an unknown status or page', function (string $query, string $field) {
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('GET', '/api/institution/linkage-requests?'.$query)->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([['status=pendiente', 'status'], ['status[]=ACEPTADA', 'status'], ['page=0', 'page'], ['page=x', 'page']]);
});

describe('detalle (CA-02, CA-05)', function () {
    it('returns the full request for evaluation', function () {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student);
        foreach ([['Python', 'technical'], ['Trabajo en equipo', 'soft']] as $position => [$name, $kind]) {
            $skill = Skill::query()->forceCreate(['name' => $name, 'slug' => mb_strtolower($name), 'kind' => $kind]);
            DB::table('opportunity_skills')->insert(['opportunity_id' => $this->opportunity->id, 'skill_id' => $skill->id, 'position' => $position]);
        }
        $municipality = Municipality::query()->find('28032')->name;
        $this->loginWithCookies($this->account)->assertOk();

        $response = $this->browserRequest('GET', '/api/institution/linkage-requests/'.$linkage->id)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        expect($response->json('data'))->toBe([
            'id' => $linkage->id,
            'status' => 'PENDIENTE_INSTITUCION',
            'created_at' => $linkage->created_at->toISOString(),
            'company' => [
                'name' => 'ManuGolfo', 'municipality' => Municipality::query()->find('28041')->name,
                'legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'trade_name' => 'ManuGolfo', 'sector_code' => '54', 'state_code' => '28',
                'contact_name' => 'Laura Méndez', 'contact_email' => 'dual@manugolfo.mx', 'contact_phone' => '8331234567',
            ],
            'opportunity' => [
                'id' => $this->opportunity->id, 'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'vacancies' => 2,
                'period_type' => 'semester', 'period_number' => 5, 'can_relocate' => true, 'state_code' => '28', 'municipality' => $municipality,
                'description' => 'Actividades.', 'skills' => [['name' => 'Python', 'kind' => 'technical'], ['name' => 'Trabajo en equipo', 'kind' => 'soft']],
                'language_code' => 'en', 'min_level' => 3, 'is_active' => true,
            ],
            'student' => [
                'id' => $this->student->id, 'enrollment_number' => 'MAT-0001', 'given_names' => 'Ana Sofía', 'first_surname' => 'García',
                'second_surname' => 'López', 'is_active' => true, 'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6,
                'dual_available' => true, 'state_code' => '28', 'municipality' => $municipality, 'can_relocate' => false,
                'social_security' => ['has_nss' => false, 'has_document' => false],
            ],
            'message' => 'Nos interesa su perfil.',
            'responded_at' => null,
            'response_message' => null,
            'responded_by' => null,
        ]);
    });

    it('reports whether the NSS and the IMSS document exist without exposing them', function (bool $nss, bool $document) {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student);
        receivedSocialSecurity($this->student, $nss, $document);
        $this->loginWithCookies($this->account)->assertOk();

        $response = $this->browserRequest('GET', '/api/institution/linkage-requests/'.$linkage->id)->assertOk();
        expect($response->json('data.student.social_security'))->toBe(['has_nss' => $nss, 'has_document' => $document])
            ->and($response->getContent())->not->toContain('12345678903')->not->toContain('secreto.pdf')->not->toContain('vigencia.pdf')
            ->not->toContain('nss_hash')->not->toContain('document_path')->not->toContain('location');
    })->with([[true, true], [true, false], [false, true]]);

    it('shows inactive students and opportunities and cancelled requests', function () {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student, 'CANCELADA');
        $this->student->forceFill(['is_active' => false])->save();
        $this->opportunity->forceFill(['is_active' => false])->save();
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('GET', '/api/institution/linkage-requests/'.$linkage->id)->assertOk()
            ->assertJsonPath('data.status', 'CANCELADA')
            ->assertJsonPath('data.student.is_active', false)
            ->assertJsonPath('data.opportunity.is_active', false);
    });

    it('answers 404 for another institution request exactly like a missing one', function () {
        $foreign = receivedLinkage($this->company, $this->opportunity, receivedStudent(Institution::factory()->create()));
        $this->loginWithCookies($this->account)->assertOk();

        foreach ([$foreign->id, 999999] as $id) {
            $this->browserRequest('GET', '/api/institution/linkage-requests/'.$id)
                ->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
        }
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('GET', '/api/institution/linkage-requests/'.$id)->assertNotFound();
    })->with(['0', 'abc', '-1', '1234567890123456789']);

    it('has no write routes besides the decision (HU-S6-02)', function (string $method) {
        $linkage = receivedLinkage($this->company, $this->opportunity, $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest($method, '/api/institution/linkage-requests/'.$linkage->id)->assertStatus(405);
        expect($linkage->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    })->with(['PUT', 'PATCH', 'DELETE']);
});
