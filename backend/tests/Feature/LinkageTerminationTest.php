<?php

use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageMessage;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// T-S14-12 y T-S14-13: aviso de otras vinculaciones aceptadas del alumno y baja de una vinculación aceptada.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->institutionAccount = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual']);
    $this->company = Company::factory()->create();
    $this->companyAccount = User::factory()->forCompany($this->company)->create(['name' => 'Reclutadora']);
    $this->student = Student::factory()->for($this->institution)->withIdentity()->create();
    $this->opportunity = terminationOpportunity($this->company, 1);
    $this->linkage = terminationLinkage($this->company, $this->opportunity, $this->student, 'ACEPTADA');
});

function terminationOpportunity(Company $company, int $vacancies): Opportunity
{
    $opportunity = new Opportunity([
        'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'period_number' => 5,
        'vacancies' => $vacancies, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();

    return $opportunity->refresh();
}

function terminationLinkage(Company $company, Opportunity $opportunity, Student $student, string $status = 'PENDIENTE_INSTITUCION'): LinkageRequest
{
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = User::factory()->forCompany($company)->create()->id;
    $linkage->status = $status;
    if (in_array($status, ['ACEPTADA', 'RECHAZADA'], true)) {
        $linkage->responded_at = now();
        $linkage->responded_by = User::factory()->forInstitution($student->institution)->create()->id;
    }
    $linkage->save();

    return $linkage->refresh();
}

describe('baja de una vinculación aceptada (T-S14-13)', function () {
    it('lets the institution terminate it with a reason, frees the place and records who and when', function () {
        $this->freezeSecond();
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        $response = $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => '  El alumno cambió de programa.  '])
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private');

        expect($response->json('data.status'))->toBe('BAJA')
            ->and($response->json('data.termination'))->toBe(['at' => now()->toISOString(), 'party' => 'INSTITUTION', 'reason' => 'El alumno cambió de programa.', 'by' => ['name' => 'Coordinación Dual']])
            ->and($response->json('data.opportunity.accepted_count'))->toBe(0);
        expect($this->linkage->refresh()->terminated_by)->toBe($this->institutionAccount->id);
    });

    it('lets the company terminate it and never shows the other side who registered it', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PATCH', "/api/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'El alumno no se presentó.'])
            ->assertOk()->assertJsonPath('data.status', 'BAJA')
            ->assertJsonPath('data.termination.party', 'COMPANY')->assertJsonPath('data.termination.by', ['name' => 'Reclutadora']);

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('GET', "/api/institution/linkage-requests/{$this->linkage->id}")->assertOk()
            ->assertJsonPath('data.termination.party', 'COMPANY')->assertJsonPath('data.termination.by', null)
            ->assertJsonPath('data.termination.reason', 'El alumno no se presentó.');
    });

    it('frees the place: the opportunity accepts a new request again', function () {
        $other = Student::factory()->for($this->institution)->withIdentity()->create();
        $pending = terminationLinkage($this->company, $this->opportunity, $other);
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$pending->id}/decision", ['status' => 'ACEPTADA'])->assertUnprocessable();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'Concluyó su estancia.'])->assertOk();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$pending->id}/decision", ['status' => 'ACEPTADA'])->assertOk()
            ->assertJsonPath('data.opportunity.accepted_count', 1);
    });

    it('only terminates accepted requests of its own organization', function (string $status) {
        $linkage = terminationLinkage($this->company, terminationOpportunity($this->company, 2), Student::factory()->for($this->institution)->withIdentity()->create(), $status);
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('PATCH', "/api/linkage-requests/{$linkage->id}/termination", ['reason' => 'Motivo.'])->assertUnprocessable()
            ->assertJsonPath('errors.status.0', 'Solo puedes dar de baja vinculaciones aceptadas.');
        expect($linkage->refresh()->status->value)->toBe($status);
    })->with(['PENDIENTE_INSTITUCION', 'RECHAZADA', 'CANCELADA']);

    it('answers 404 for another organization and requires CSRF, a reason without contact data and nothing else', function () {
        $foreign = User::factory()->forInstitution(Institution::factory()->create())->create();
        $this->loginWithCookies($foreign)->assertOk();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'Motivo.'])->assertNotFound();

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'Motivo.'], csrf: false)->assertStatus(419);
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => '   '])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'Escríbeme a coordinacion@ut.test'])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->browserRequest('PATCH', "/api/institution/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'Motivo.', 'status' => 'ACEPTADA'])->assertUnprocessable()->assertJsonValidationErrors('status');
        expect($this->linkage->refresh()->status->value)->toBe('ACEPTADA');
    });

    it('keeps the conversation readable but closed for writing', function () {
        $message = new LinkageMessage(['body' => 'Bienvenido.']);
        $message->linkage_request_id = $this->linkage->id;
        $message->sender_party = 'INSTITUTION';
        $message->sender_user_id = $this->institutionAccount->id;
        $message->save();
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('PATCH', "/api/linkage-requests/{$this->linkage->id}/termination", ['reason' => 'El alumno no se presentó.'])->assertOk();

        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/messages")->assertOk()
            ->assertJsonPath('data.0.body', 'Bienvenido.')->assertJsonPath('meta.can_write', false);
        $this->browserRequest('POST', "/api/linkage-requests/{$this->linkage->id}/messages", ['body' => '¿Sigue disponible?'])->assertUnprocessable()
            ->assertJsonPath('errors.status.0', 'La vinculación se dio de baja: la conversación queda en solo lectura.');
    });

    it('enforces the termination data with the database', function () {
        expect(fn () => DB::table('linkage_requests')->where('id', $this->linkage->id)->update(['status' => 'BAJA']))
            ->toThrow(QueryException::class);
    });
});

describe('otras vinculaciones aceptadas del alumno (T-S14-12)', function () {
    it('tells the institution which other companies already accepted the same student, without the current one', function () {
        $otherCompany = Company::factory()->create(['trade_name' => 'Taller Norteño']);
        $elsewhere = terminationLinkage($otherCompany, terminationOpportunity($otherCompany, 3), $this->student, 'ACEPTADA');
        $pending = terminationLinkage($this->company, terminationOpportunity($this->company, 3), $this->student);
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        $others = $this->browserRequest('GET', "/api/institution/linkage-requests/{$pending->id}")->assertOk()->json('data.student_accepted_elsewhere');
        expect(collect($others)->pluck('id')->sort()->values()->all())->toBe(collect([$this->linkage->id, $elsewhere->id])->sort()->values()->all())
            ->and(collect($others)->pluck('company'))->toContain('Taller Norteño')
            ->and(array_keys($others[0]))->toBe(['id', 'company', 'opportunity', 'responded_at']);

        $this->browserRequest('GET', "/api/institution/linkage-requests/{$this->linkage->id}")->assertOk()
            ->assertJsonCount(1, 'data.student_accepted_elsewhere')->assertJsonPath('data.student_accepted_elsewhere.0.id', $elsewhere->id);
    });
});
