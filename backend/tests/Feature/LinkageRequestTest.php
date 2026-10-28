<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use App\Support\ContactInformation;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S5-04: solicitud de vinculación directa a la institución desde el perfil anónimo.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->company = Company::factory()->create(['state_code' => '28', 'municipality_code' => '28032']);
    $this->account = User::factory()->forCompany($this->company)->create();
    $this->institution = Institution::factory()->create();
    $this->student = linkageStudent($this->institution);
    $this->opportunity = linkageOpportunity($this->company);
});

/** Alumno del universo del buscador (HU-S4-05): activo, con expediente público y punto; con identidad protegida. */
function linkageStudent(Institution $institution, array $values = []): Student
{
    $student = Student::factory()->for($institution)->withIdentity([
        'enrollment_number' => 'MAT-'.strtoupper(bin2hex(random_bytes(3))), 'given_names' => 'Nombre Secreto', 'first_surname' => 'Apellido Secreto',
    ])->create();
    DB::table('students')->where('id', $student->id)->update(array_replace([
        'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false,
    ], $values));
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    return $student->fresh();
}

function linkageOpportunity(Company $company, bool $active = true): Opportunity
{
    $opportunity = new Opportunity([
        'title' => 'Automatización de línea', 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 3, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->is_active = $active;
    $opportunity->save();

    return $opportunity->refresh();
}

function sendLinkage($test, array $overrides = [])
{
    return $test->browserRequest('POST', '/api/linkage-requests', array_replace([
        'student_public_id' => $test->student->public_id,
        'opportunity_id' => $test->opportunity->id,
        'message' => 'Nos interesa su perfil para el proyecto de automatización.',
    ], $overrides));
}

describe('acceso (CA-01)', function () {
    it('rejects visitors', function () {
        $this->startCookieSession();
        sendLinkage($this)->assertUnauthorized();
        expect(LinkageRequest::query()->count())->toBe(0);
    });

    it('forbids every other role', function (UserRole $role) {
        $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution($this->institution)->create() : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        sendLinkage($this)->assertForbidden();
        expect(LinkageRequest::query()->count())->toBe(0);
    })->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::SECRETARY]);

    it('rejects the accounts of an inactive company with COMPANY_INACTIVE', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $this->company->forceFill(['is_active' => false])->save();

        sendLinkage($this)->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
        expect(LinkageRequest::query()->count())->toBe(0);
    });

    it('requires CSRF', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('POST', '/api/linkage-requests', [
            'student_public_id' => $this->student->public_id, 'opportunity_id' => $this->opportunity->id,
        ], csrf: false)->assertStatus(419);
    });

    it('limits the requests per account', function () {
        $this->loginWithCookies($this->account)->assertOk();
        foreach (range(1, 20) as $attempt) {
            sendLinkage($this, ['student_public_id' => '00000000-0000-4000-8000-'.str_pad((string) $attempt, 12, '0', STR_PAD_LEFT)])->assertNotFound();
        }
        sendLinkage($this)->assertTooManyRequests();
    });
});

describe('alta directa (CA-02, CA-04, CA-05)', function () {
    beforeEach(fn () => $this->loginWithCookies($this->account)->assertOk());

    it('creates a pending request linked to the company, opportunity, student, institution and account', function () {
        $response = sendLinkage($this, [
            // El cliente no decide ninguno de los vínculos ni el estado.
            'company_id' => 999, 'student_id' => 999, 'institution_id' => 999, 'requested_by' => 999, 'status' => 'ACEPTADA',
        ])->assertCreated()->assertHeader('Cache-Control', 'no-store, private');

        $linkage = LinkageRequest::query()->sole();
        expect($linkage->company_id)->toBe($this->company->id)
            ->and($linkage->opportunity_id)->toBe($this->opportunity->id)
            ->and($linkage->student_id)->toBe($this->student->id)
            ->and($linkage->institution_id)->toBe($this->institution->id)
            ->and($linkage->requested_by)->toBe($this->account->id)
            ->and($linkage->status->value)->toBe('PENDIENTE_INSTITUCION');

        $response->assertExactJson(['data' => [
            'id' => $linkage->id,
            'status' => 'PENDIENTE_INSTITUCION',
            'student_public_id' => $this->student->public_id,
            'opportunity' => ['id' => $this->opportunity->id, 'title' => 'Automatización de línea'],
            'message' => 'Nos interesa su perfil para el proyecto de automatización.',
            'created_at' => $linkage->created_at->toISOString(),
        ]]);
    });

    it('accepts a request without message', function () {
        sendLinkage($this, ['message' => null])->assertCreated()->assertJsonPath('data.message', null);
    });

    it('never reveals protected student data (CA-05)', function () {
        DB::table('student_social_security')->insert(['student_id' => $this->student->id, 'institution_id' => $this->institution->id,
            'nss' => encrypt('12345678901'), 'nss_hash' => hash('sha256', '12345678901'), 'created_at' => now(), 'updated_at' => now()]);
        $body = sendLinkage($this)->assertCreated()->getContent().
            $this->browserRequest('GET', '/api/talent/'.$this->student->public_id)->assertOk()->getContent();

        expect($body)->not->toContain('Nombre Secreto')->not->toContain('Apellido Secreto')->not->toContain('MAT-')
            ->not->toContain('12345678901')->not->toContain('"student_id"')->not->toContain('institution_id')
            ->not->toContain('location');
    });

    it('allows the same student in another opportunity of the company', function () {
        sendLinkage($this)->assertCreated();
        sendLinkage($this, ['opportunity_id' => linkageOpportunity($this->company)->id])->assertCreated();
        expect(LinkageRequest::query()->count())->toBe(2);
    });
});

describe('validaciones de integridad (CA-03)', function () {
    beforeEach(fn () => $this->loginWithCookies($this->account)->assertOk());

    it('answers 404 «El perfil no existe.» outside the talent search universe', function (Closure $profile) {
        $publicId = $profile($this);

        sendLinkage($this, ['student_public_id' => $publicId])
            ->assertNotFound()->assertExactJson(['message' => 'El perfil no existe.']);
        expect(LinkageRequest::query()->count())->toBe(0);
    })->with([
        'inexistente' => [fn () => '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'],
        'inactivo' => [fn ($test) => linkageStudent($test->institution, ['is_active' => false])->public_id],
        'de institución inactiva' => [fn () => linkageStudent(Institution::factory()->inactive()->create())->public_id],
        'sin expediente' => [fn ($test) => linkageStudent($test->institution, ['program' => null])->public_id],
        'sin punto' => [fn ($test) => linkageStudent($test->institution, ['state_code' => null, 'municipality_code' => null])->public_id],
    ]);

    it('rejects another company opportunity exactly like a missing one', function () {
        $foreign = linkageOpportunity(Company::factory()->create());

        foreach ([$foreign->id, 999999] as $id) {
            sendLinkage($this, ['opportunity_id' => $id])
                ->assertUnprocessable()->assertJsonValidationErrors(['opportunity_id' => 'La oportunidad no existe.']);
        }
        expect(LinkageRequest::query()->count())->toBe(0);
    });

    it('rejects an inactive opportunity', function () {
        sendLinkage($this, ['opportunity_id' => linkageOpportunity($this->company, active: false)->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['opportunity_id' => 'Solo puedes usar oportunidades activas. Reactívala o elige otra.']);
        expect(LinkageRequest::query()->count())->toBe(0);
    });

    it('rejects a second active request for the same student and opportunity', function (string $status) {
        sendLinkage($this)->assertCreated();
        LinkageRequest::query()->update(['status' => $status]);

        sendLinkage($this)->assertUnprocessable()
            ->assertJsonValidationErrors(['opportunity_id' => 'Ya enviaste una solicitud para este perfil en esa oportunidad.']);
        expect(LinkageRequest::query()->count())->toBe(1);
    })->with(['PENDIENTE_INSTITUCION', 'ACEPTADA']);

    it('allows a new request after a rejected one', function () {
        sendLinkage($this)->assertCreated();
        LinkageRequest::query()->update(['status' => 'RECHAZADA']);

        sendLinkage($this)->assertCreated();
        expect(LinkageRequest::query()->count())->toBe(2);
    });

    it('enforces a single active request in the database even without the check', function () {
        sendLinkage($this)->assertCreated();
        $row = (array) DB::table('linkage_requests')->first();
        unset($row['id']);

        expect(fn () => DB::table('linkage_requests')->insert($row))->toThrow(UniqueConstraintViolationException::class);
    });

    it('validates the payload', function (array $overrides, string $field) {
        sendLinkage($this, $overrides)->assertUnprocessable()->assertJsonValidationErrors($field);
        expect(LinkageRequest::query()->count())->toBe(0);
    })->with([
        'sin perfil' => [['student_public_id' => null], 'student_public_id'],
        'perfil con students.id' => [['student_public_id' => '1'], 'student_public_id'],
        'perfil mal formado' => [['student_public_id' => 'abc'], 'student_public_id'],
        'sin oportunidad' => [['opportunity_id' => null], 'opportunity_id'],
        'oportunidad en texto' => [['opportunity_id' => 'uno'], 'opportunity_id'],
        'oportunidad 0' => [['opportunity_id' => 0], 'opportunity_id'],
        'oportunidad fuera de rango' => [['opportunity_id' => 10 ** 19], 'opportunity_id'],
        'mensaje largo' => [['message' => str_repeat('a', 501)], 'message'],
    ]);

    it('rejects contact information in the message', function (string $message) {
        sendLinkage($this, ['message' => $message])
            ->assertUnprocessable()->assertJsonValidationErrors(['message' => ContactInformation::OPPORTUNITY_MESSAGE]);
    })->with(['Escríbenos a rh@empresa.mx', 'Llámanos al 899 123 4567', 'Más en https://empresa.mx']);

    it('allows a 500-character message', function () {
        sendLinkage($this, ['message' => str_repeat('a', 500)])->assertCreated();
    });
});

describe('oportunidades activas para la solicitud (CA-06)', function () {
    it('lists only the active opportunities of the session company, newest first', function () {
        $this->travel(1)->minutes();
        $newer = linkageOpportunity($this->company);
        linkageOpportunity($this->company, active: false);
        linkageOpportunity(Company::factory()->create());
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('GET', '/api/opportunities/options')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => [
                ['id' => $newer->id, 'title' => 'Automatización de línea', 'program' => 'Ingeniería Mecatrónica', 'municipality' => 'Reynosa'],
                ['id' => $this->opportunity->id, 'title' => 'Automatización de línea', 'program' => 'Ingeniería Mecatrónica', 'municipality' => 'Reynosa'],
            ]]);
    });

    it('is only for COMPANY accounts', function () {
        $this->loginWithCookies(User::factory()->role(UserRole::SECRETARY)->create())->assertOk();
        $this->browserRequest('GET', '/api/opportunities/options')->assertForbidden();
    });
});
