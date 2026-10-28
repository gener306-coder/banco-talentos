<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S6-02: respuesta institucional (ACEPTADA / RECHAZADA) y su reflejo en la bandeja de la empresa.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual UT']);
    $this->company = Company::factory()->create();
    $this->companyAccount = User::factory()->forCompany($this->company)->create();
    $this->student = decisionStudent($this->institution);
    $this->opportunity = decisionOpportunity($this->company, 'Tableros de producción');
    $this->linkage = decisionLinkage($this->company, $this->opportunity, $this->student);
});

function decisionStudent(Institution $institution): Student
{
    $student = Student::factory()->for($institution)->withIdentity(['given_names' => 'Nombre Secreto', 'first_surname' => 'Apellido Secreto'])->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false, 'headline' => 'Analista de datos',
    ]);

    return $student->fresh();
}

function decisionOpportunity(Company $company, string $title): Opportunity
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

function decisionLinkage(Company $company, Opportunity $opportunity, Student $student, string $status = 'PENDIENTE_INSTITUCION'): LinkageRequest
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

function decide($test, LinkageRequest|int $linkage, array $body, bool $csrf = true)
{
    $id = $linkage instanceof LinkageRequest ? $linkage->id : $linkage;

    return $test->browserRequest('PATCH', "/api/institution/linkage-requests/{$id}/decision", $body, csrf: $csrf);
}

describe('acceso (CA-01)', function () {
    it('rejects visitors', function () {
        $this->startCookieSession();

        decide($this, $this->linkage, ['status' => 'ACEPTADA'])->assertUnauthorized();
        expect($this->linkage->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    });

    it('forbids every other role', function (UserRole $role) {
        $user = $role === UserRole::COMPANY ? $this->companyAccount : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        decide($this, $this->linkage, ['status' => 'ACEPTADA'])->assertForbidden();
        expect($this->linkage->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    })->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

    it('requires CSRF', function () {
        $this->loginWithCookies($this->account)->assertOk();

        decide($this, $this->linkage, ['status' => 'ACEPTADA'], csrf: false)->assertStatus(419);
        expect($this->linkage->refresh()->status->value)->toBe('PENDIENTE_INSTITUCION');
    });
});

describe('respuesta (CA-01, CA-03)', function () {
    it('accepts or rejects a pending request and records who answered and when', function (string $status) {
        $this->freezeSecond();
        $this->loginWithCookies($this->account)->assertOk();

        $response = decide($this, $this->linkage, ['status' => $status, 'response_message' => '  Coordinemos la entrevista la próxima semana.  '])
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private');

        expect($response->json('data.status'))->toBe($status)
            ->and($response->json('data.responded_at'))->toBe(now()->toISOString())
            ->and($response->json('data.response_message'))->toBe('Coordinemos la entrevista la próxima semana.')
            ->and($response->json('data.responded_by'))->toBe(['name' => 'Coordinación Dual UT'])
            ->and($response->json('data.student.enrollment_number'))->not->toBeNull();
        $linkage = $this->linkage->refresh();
        expect($linkage->status->value)->toBe($status)
            ->and($linkage->responded_by)->toBe($this->account->id)
            ->and($linkage->responded_at->equalTo(now()))->toBeTrue()
            ->and(DB::table('linkage_requests')->where('id', $linkage->id)->value('responded_at'))->toEndWith('+00');
    })->with(['ACEPTADA', 'RECHAZADA']);

    it('accepts without a message', function () {
        $this->loginWithCookies($this->account)->assertOk();

        decide($this, $this->linkage, ['status' => 'ACEPTADA'])->assertOk()->assertJsonPath('data.response_message', null);
        decide($this, decisionLinkage($this->company, decisionOpportunity($this->company, 'B'), $this->student), ['status' => 'RECHAZADA', 'response_message' => ''])
            ->assertOk()->assertJsonPath('data.response_message', null);
    });

    it('validates the decision', function (array $body, string $field, string $message) {
        $this->loginWithCookies($this->account)->assertOk();

        decide($this, $this->linkage, $body)->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
        expect($this->linkage->refresh())->status->value->toBe('PENDIENTE_INSTITUCION')->responded_at->toBeNull();
    })->with([
        'sin estado' => [[], 'status', 'Elige si aceptas o rechazas la solicitud.'],
        'pendiente' => [['status' => 'PENDIENTE_INSTITUCION'], 'status', 'Elige si aceptas o rechazas la solicitud.'],
        'cancelada' => [['status' => 'CANCELADA'], 'status', 'Elige si aceptas o rechazas la solicitud.'],
        'minúsculas' => [['status' => 'aceptada'], 'status', 'Elige si aceptas o rechazas la solicitud.'],
        'arreglo' => [['status' => ['ACEPTADA']], 'status', 'Elige si aceptas o rechazas la solicitud.'],
        'mensaje largo' => [['status' => 'ACEPTADA', 'response_message' => str_repeat('a', 501)], 'response_message', 'El mensaje no debe superar 500 caracteres.'],
        'mensaje no texto' => [['status' => 'ACEPTADA', 'response_message' => 5], 'response_message', 'El mensaje no es válido.'],
        'correo' => [['status' => 'ACEPTADA', 'response_message' => 'Escribe a rh@escuela.mx'], 'response_message', 'No incluyas enlaces, correos ni teléfonos: la empresa ya tiene el contacto de tu institución.'],
        'teléfono' => [['status' => 'RECHAZADA', 'response_message' => 'Llama al (834) 123-4567'], 'response_message', 'No incluyas enlaces, correos ni teléfonos: la empresa ya tiene el contacto de tu institución.'],
        'enlace' => [['status' => 'ACEPTADA', 'response_message' => 'Ver https://escuela.mx'], 'response_message', 'No incluyas enlaces, correos ni teléfonos: la empresa ya tiene el contacto de tu institución.'],
        'campo extra' => [['status' => 'ACEPTADA', 'responded_by' => 1], 'responded_by', 'La respuesta solo admite el estado y el mensaje.'],
        'otro campo' => [['status' => 'ACEPTADA', 'student_id' => 1], 'student_id', 'La respuesta solo admite el estado y el mensaje.'],
    ]);

    it('allows the 500 character limit', function () {
        $this->loginWithCookies($this->account)->assertOk();

        decide($this, $this->linkage, ['status' => 'ACEPTADA', 'response_message' => str_repeat('a', 500)])->assertOk();
    });
});

describe('concurrencia y elegibilidad (CA-02)', function () {
    it('only answers pending requests', function (string $status) {
        $linkage = decisionLinkage($this->company, decisionOpportunity($this->company, 'B'), $this->student, $status);
        $this->loginWithCookies($this->account)->assertOk();

        decide($this, $linkage, ['status' => 'RECHAZADA', 'response_message' => 'Tarde.'])->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Solo puedes responder solicitudes pendientes.']);
        expect($linkage->refresh())->status->value->toBe($status)->responded_at->toBeNull()->response_message->toBeNull();
    })->with(['ACEPTADA', 'RECHAZADA', 'CANCELADA']);

    it('cannot answer twice', function () {
        $this->loginWithCookies($this->account)->assertOk();

        decide($this, $this->linkage, ['status' => 'ACEPTADA'])->assertOk();
        decide($this, $this->linkage, ['status' => 'RECHAZADA'])->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Solo puedes responder solicitudes pendientes.']);
        expect($this->linkage->refresh()->status->value)->toBe('ACEPTADA');
    });

    it('lets the company no longer cancel an answered request', function () {
        $this->loginWithCookies($this->account)->assertOk();
        decide($this, $this->linkage, ['status' => 'ACEPTADA'])->assertOk();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('PATCH', '/api/linkage-requests/'.$this->linkage->id.'/cancel')->assertUnprocessable();
        expect($this->linkage->refresh()->status->value)->toBe('ACEPTADA');
    });

    it('answers 404 for another institution request exactly like a missing one', function () {
        $foreign = decisionLinkage($this->company, $this->opportunity, decisionStudent(Institution::factory()->create()));
        $this->loginWithCookies($this->account)->assertOk();

        foreach ([$foreign->id, 999999] as $id) {
            decide($this, $id, ['status' => 'ACEPTADA'])->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
        }
        expect($foreign->refresh())->status->value->toBe('PENDIENTE_INSTITUCION')->responded_at->toBeNull();
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$id}/decision", ['status' => 'ACEPTADA'])->assertNotFound();
    })->with(['0', 'abc', '-1', '1234567890123456789']);

    it('enforces the response columns in the database', function () {
        expect(fn () => DB::table('linkage_requests')->where('id', $this->linkage->id)->update(['responded_at' => now()]))
            ->toThrow(QueryException::class);
        expect(fn () => DB::table('linkage_requests')->where('id', $this->linkage->id)->update(['response_message' => 'Sin fecha']))
            ->toThrow(QueryException::class);
    });
});

describe('visibilidad (CA-04, CA-05)', function () {
    it('shows the response in the institution detail with who answered', function () {
        $this->loginWithCookies($this->account)->assertOk();
        decide($this, $this->linkage, ['status' => 'RECHAZADA', 'response_message' => 'El alumno ya tiene un proyecto dual.'])->assertOk();

        $this->browserRequest('GET', '/api/institution/linkage-requests/'.$this->linkage->id)->assertOk()
            ->assertJsonPath('data.status', 'RECHAZADA')
            ->assertJsonPath('data.response_message', 'El alumno ya tiene un proyecto dual.')
            ->assertJsonPath('data.responded_by', ['name' => 'Coordinación Dual UT']);
    });

    it('shows the company the date and message, never who answered nor protected student data', function () {
        $this->loginWithCookies($this->account)->assertOk();
        decide($this, $this->linkage, ['status' => 'ACEPTADA', 'response_message' => 'Coordinemos la entrevista.'])->assertOk();
        $respondedAt = $this->linkage->refresh()->responded_at->toISOString();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $response = $this->browserRequest('GET', '/api/linkage-requests')->assertOk();
        expect($response->json('data.0'))->toMatchArray([
            'status' => 'ACEPTADA', 'responded_at' => $respondedAt, 'response_message' => 'Coordinemos la entrevista.',
        ]);
        expect($response->getContent())->not->toContain('responded_by')->not->toContain('Coordinación Dual UT')
            ->not->toContain('Nombre Secreto')->not->toContain('Apellido Secreto')->not->toContain('"student_id"')->not->toContain('location');
    });
});
