<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S5-05: bandeja empresarial de solicitudes de vinculación enviadas.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->company = Company::factory()->create();
    $this->account = User::factory()->forCompany($this->company)->create();
    $this->institution = Institution::factory()->create(['name' => 'Universidad Tecnológica del Golfo', 'contact_email' => 'dual@utgolfo.edu.mx']);
    $this->student = inboxStudent($this->institution, 'Analista de datos');
    $this->opportunity = inboxOpportunity($this->company, 'Tableros de producción');
});

/** Alumno con expediente público, titular e identidad protegida. */
function inboxStudent(Institution $institution, string $headline): Student
{
    $student = Student::factory()->for($institution)->withIdentity([
        'enrollment_number' => 'MAT-'.strtoupper(bin2hex(random_bytes(3))), 'given_names' => 'Nombre Secreto', 'first_surname' => 'Apellido Secreto',
    ])->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false, 'headline' => $headline,
    ]);
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    return $student->fresh();
}

function inboxOpportunity(Company $company, string $title): Opportunity
{
    $opportunity = new Opportunity([
        'title' => $title, 'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();

    return $opportunity->refresh();
}

/** Solicitud guardada directamente, como la deja HU-S5-04. */
function inboxLinkage(Company $company, Opportunity $opportunity, Student $student, string $status = 'PENDIENTE_INSTITUCION'): LinkageRequest
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

describe('acceso', function () {
    it('rejects visitors', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $this->startCookieSession();

        $this->browserRequest('GET', '/api/linkage-requests')->assertUnauthorized();
        $this->browserRequest('PATCH', '/api/linkage-requests/'.$linkage->id.'/cancel')->assertUnauthorized();
    });

    it('forbids every other role', function (UserRole $role) {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution($this->institution)->create() : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('GET', '/api/linkage-requests')->assertForbidden();
        $this->browserRequest('PATCH', '/api/linkage-requests/'.$linkage->id.'/cancel')->assertForbidden();
        expect($linkage->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    })->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::SECRETARY]);

    it('rejects the accounts of an inactive company with COMPANY_INACTIVE', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $this->company->forceFill(['is_active' => false])->save();

        $this->browserRequest('GET', '/api/linkage-requests')->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
    });
});

describe('bandeja (CA-01, CA-02)', function () {
    it('lists only its own requests, newest first, 20 per page', function () {
        $start = now()->subDays(30);
        foreach (range(1, 21) as $i) {
            $this->travelTo($start->copy()->addDays($i));
            inboxLinkage($this->company, inboxOpportunity($this->company, "Oportunidad $i"), $this->student);
        }
        $this->travelBack();
        inboxLinkage(Company::factory()->create(), inboxOpportunity(Company::factory()->create(), 'Ajena'), $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        $first = $this->browserRequest('GET', '/api/linkage-requests')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        expect(array_column(array_column($first->json('data'), 'opportunity'), 'title'))->toBe(array_map(fn (int $i): string => "Oportunidad $i", range(21, 2)))
            ->and($first->json('meta'))->toBe(['current_page' => 1, 'last_page' => 2, 'total' => 21, 'per_page' => 20]);
        $second = $this->browserRequest('GET', '/api/linkage-requests?page=2')->assertOk();
        expect(array_column(array_column($second->json('data'), 'opportunity'), 'title'))->toBe(['Oportunidad 1']);
    });

    it('returns the anonymous profile summary and the institution contact, never protected data', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        DB::table('student_links')->insert(['student_id' => $this->student->id, 'institution_id' => $this->institution->id,
            'kind' => 'github', 'url' => 'https://github.com/secreta', 'position' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $this->loginWithCookies($this->account)->assertOk();

        $response = $this->browserRequest('GET', '/api/linkage-requests')->assertOk();
        expect($response->json('data'))->toBe([[
            'id' => $linkage->id,
            'status' => 'PENDIENTE_INSTITUCION',
            'created_at' => $linkage->created_at->toISOString(),
            'message' => 'Nos interesa su perfil.',
            'opportunity' => ['id' => $this->opportunity->id, 'title' => 'Tableros de producción'],
            'profile' => [
                'public_id' => $this->student->public_id, 'headline' => 'Analista de datos', 'program' => 'Ingeniería en Datos',
                'period_type' => 'semester', 'period_number' => 6,
            ],
            'institution' => ['name' => 'Universidad Tecnológica del Golfo', 'contact_email' => 'dual@utgolfo.edu.mx'],
            'responded_at' => null,
            'response_message' => null,
        ]]);
        expect($response->getContent())->not->toContain('Nombre Secreto')->not->toContain('Apellido Secreto')->not->toContain('MAT-')
            ->not->toContain('github.com/secreta')->not->toContain('"student_id"')->not->toContain('location');
    });

    it('filters by status', function (string $status, int $count) {
        inboxLinkage($this->company, $this->opportunity, $this->student, 'PENDIENTE_INSTITUCION');
        inboxLinkage($this->company, inboxOpportunity($this->company, 'B'), $this->student, 'CANCELADA');
        inboxLinkage($this->company, inboxOpportunity($this->company, 'C'), $this->student, 'CANCELADA');
        inboxLinkage($this->company, inboxOpportunity($this->company, 'D'), $this->student, 'RECHAZADA');
        $this->loginWithCookies($this->account)->assertOk();

        $data = $this->browserRequest('GET', '/api/linkage-requests?status='.$status)->assertOk()->json('data');
        expect($data)->toHaveCount($count)->and(array_unique(array_column($data, 'status')))->toBe($count ? [$status] : []);
    })->with([['PENDIENTE_INSTITUCION', 1], ['CANCELADA', 2], ['RECHAZADA', 1], ['ACEPTADA', 0]]);

    it('filters by anonymous profile without revealing other companies requests (CA-04)', function () {
        $other = inboxStudent($this->institution, 'Otro perfil');
        inboxLinkage($this->company, $this->opportunity, $this->student);
        inboxLinkage($this->company, inboxOpportunity($this->company, 'Calidad'), $this->student, 'CANCELADA');
        inboxLinkage($this->company, $this->opportunity, $other);
        inboxLinkage(Company::factory()->create(), inboxOpportunity(Company::factory()->create(), 'Ajena'), $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        $data = $this->browserRequest('GET', '/api/linkage-requests?public_id='.$this->student->public_id)->assertOk()->json('data');
        expect(array_column(array_column($data, 'opportunity'), 'title'))->toEqualCanonicalizing(['Tableros de producción', 'Calidad']);
    });

    it('validates the filters', function (string $query, string $field) {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('GET', '/api/linkage-requests?'.$query)->assertUnprocessable()->assertJsonValidationErrors($field);
    })->with([['status=ENVIADA', 'status'], ['public_id=123', 'public_id'], ['page=0', 'page']]);
});

describe('cancelación (CA-03)', function () {
    it('cancels its own pending request and returns it', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', '/api/linkage-requests/'.$linkage->id.'/cancel')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.id', $linkage->id)
            ->assertJsonPath('data.status', 'CANCELADA')
            ->assertJsonPath('data.institution.contact_email', 'dual@utgolfo.edu.mx');
        expect($linkage->refresh()->status->value)->toBe('CANCELADA');
    });

    it('lets the company request the same profile again after cancelling', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('PATCH', '/api/linkage-requests/'.$linkage->id.'/cancel')->assertOk();

        $this->browserRequest('POST', '/api/linkage-requests', [
            'student_public_id' => $this->student->public_id, 'opportunity_id' => $this->opportunity->id,
        ])->assertCreated();
    });

    it('rejects cancelling a request that is no longer pending', function (string $status) {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student, $status);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', '/api/linkage-requests/'.$linkage->id.'/cancel')->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Solo puedes cancelar solicitudes pendientes de la institución.']);
        expect($linkage->refresh()->status->value)->toBe($status);
    })->with(['ACEPTADA', 'RECHAZADA', 'CANCELADA']);

    it('answers 404 for another company request exactly like a missing one', function () {
        $foreign = inboxLinkage($other = Company::factory()->create(), inboxOpportunity($other, 'Ajena'), $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        foreach ([$foreign->id, 999999] as $id) {
            $this->browserRequest('PATCH', '/api/linkage-requests/'.$id.'/cancel')
                ->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
        }
        expect($foreign->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('PATCH', '/api/linkage-requests/'.$id.'/cancel')->assertNotFound();
    })->with(['0', 'abc', '-1', '1234567890123456789']);

    it('requires CSRF and has no DELETE', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', '/api/linkage-requests/'.$linkage->id.'/cancel', csrf: false)->assertStatus(419);
        $this->browserRequest('DELETE', '/api/linkage-requests/'.$linkage->id.'/cancel')->assertStatus(405);
        expect($linkage->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    });
});
