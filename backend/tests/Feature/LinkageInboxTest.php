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
    $this->institution = Institution::factory()->create(['name' => 'Universidad Tecnológica del Golfo', 'contact_name' => 'Laura Méndez', 'contact_position' => 'Coordinación Dual', 'contact_email' => 'dual@utgolfo.edu.mx', 'contact_phone' => '+52 833 357 4800']);
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
        'title' => $title, 'program' => 'Ingeniería en Datos', 'period_number' => 5,
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
            // T-S15-03: estado de la oportunidad, para avisar a la empresa que la institución no puede aceptar.
            'opportunity' => ['id' => $this->opportunity->id, 'title' => 'Tableros de producción', 'is_active' => true],
            'profile' => [
                'public_id' => $this->student->public_id, 'headline' => 'Analista de datos', 'program' => 'Ingeniería en Datos',
                'period_type' => 'semester', 'period_number' => 6,
            ],
            'institution' => [
                'name' => 'Universidad Tecnológica del Golfo', 'contact_name' => 'Laura Méndez', 'contact_position' => 'Coordinación Dual',
                'contact_email' => 'dual@utgolfo.edu.mx', 'contact_phone' => '+52 833 357 4800',
            ],
            'responded_at' => null,
            'response_message' => null,
            'termination' => null,
            'unread_count' => 0,
            'last_message_at' => null,
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

    it('reports that its opportunity is inactive, in the detail and in the inbox (T-S15-03)', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $this->opportunity->forceFill(['is_active' => false])->save();
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('GET', '/api/linkage-requests/'.$linkage->id)->assertOk()->assertJsonPath('data.opportunity.is_active', false);
        $this->browserRequest('GET', '/api/linkage-requests')->assertOk()->assertJsonPath('data.0.opportunity.is_active', false);
    });

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

/** Fija los momentos de una solicitud para probar el orden (T-S13-09). */
function inboxMoments(LinkageRequest $linkage, string $created, ?string $responded = null, ?string $lastMessage = null): void
{
    // La respuesta va siempre con quien respondió (restricción linkage_requests_response_pair_check).
    $responder = $responded === null ? null : User::factory()->forInstitution($linkage->institution)->create()->id;
    DB::table('linkage_requests')->where('id', $linkage->id)->update([
        'created_at' => $created, 'responded_at' => $responded, 'responded_by' => $responder, 'last_message_at' => $lastMessage,
    ]);
}

describe('búsqueda, interacción y orden (T-S13-09)', function () {
    /** Ids de la bandeja de la empresa con una consulta. */
    function sentIds($test, string $query = ''): array
    {
        return array_column($test->browserRequest('GET', '/api/linkage-requests'.$query)->assertOk()->json('data'), 'id');
    }

    beforeEach(function () {
        $this->old = inboxLinkage($this->company, $this->opportunity, $this->student, 'ACEPTADA');
        $this->middle = inboxLinkage($this->company, inboxOpportunity($this->company, 'Soporte de redes'), inboxStudent($this->institution, 'Técnico en redes'));
        $other = Institution::factory()->create(['name' => 'Instituto Politécnico del Norte']);
        $this->recent = inboxLinkage($this->company, inboxOpportunity($this->company, 'Diseño 100% web'), inboxStudent($other, 'Diseñadora UX'));
        inboxMoments($this->old, '2026-10-01 09:00:00', '2026-10-02 09:00:00', '2026-11-15 10:00:00');
        inboxMoments($this->middle, '2026-10-10 09:00:00');
        inboxMoments($this->recent, '2026-10-20 09:00:00');
        $this->loginWithCookies($this->account)->assertOk();
    });

    it('orders by the latest activity by default: a new message brings an old request to the top', function () {
        expect(sentIds($this))->toBe([$this->old->id, $this->recent->id, $this->middle->id])
            ->and(sentIds($this, '?sort=activity'))->toBe([$this->old->id, $this->recent->id, $this->middle->id]);

        // La respuesta de la institución también es actividad.
        inboxMoments($this->middle, '2026-10-10 09:00:00', '2026-11-16 09:00:00');
        expect(sentIds($this))->toBe([$this->middle->id, $this->old->id, $this->recent->id])
            ->and($this->browserRequest('GET', '/api/linkage-requests')->json('data.1.last_message_at'))->toBe('2026-11-15T10:00:00.000000Z');
    });

    it('orders by request date, newest or oldest first, with the id as tie breaker', function () {
        $twin = inboxLinkage($this->company, inboxOpportunity($this->company, 'Gemela'), inboxStudent($this->institution, 'Gemelo'));
        inboxMoments($twin, '2026-10-20 09:00:00');

        expect(sentIds($this, '?sort=created_desc'))->toBe([$twin->id, $this->recent->id, $this->middle->id, $this->old->id])
            ->and(sentIds($this, '?sort=created_asc'))->toBe([$this->old->id, $this->middle->id, $this->recent->id, $twin->id]);
    });

    it('searches by institution, opportunity and public headline, without accents, case or wildcards', function () {
        expect(sentIds($this, '?q=politecnico'))->toBe([$this->recent->id])
            ->and(sentIds($this, '?q=TABLEROS'))->toBe([$this->old->id])
            ->and(sentIds($this, '?q=tecnico%20redes'))->toBe([$this->middle->id])
            // Varias palabras: todas deben aparecer (en el mismo o en distintos campos).
            ->and(sentIds($this, '?q=golfo%20redes'))->toBe([$this->middle->id])
            ->and(sentIds($this, '?q=golfo%20inexistente'))->toBe([])
            // % y _ se buscan literalmente.
            ->and(sentIds($this, '?q=100%25'))->toBe([$this->recent->id])
            ->and(sentIds($this, '?q=%25'))->toBe([$this->recent->id])
            ->and(sentIds($this, '?q=_'))->toBe([]);
    });

    it('never finds or filters requests by the student real name or enrollment number', function () {
        $identity = DB::table('student_identities')->where('student_id', $this->student->id)->first();
        expect($identity->given_names)->toBe('Nombre Secreto');

        foreach (['Secreto', 'Nombre Secreto', 'Apellido', $identity->enrollment_number, strtolower($identity->enrollment_number), 'MAT-'] as $private) {
            $response = $this->browserRequest('GET', '/api/linkage-requests?q='.urlencode($private))->assertOk();
            expect($response->json('data'))->toBe([])
                ->and($response->json('meta.total'))->toBe(0)
                ->and($response->getContent())->not->toContain('Secreto')->not->toContain($identity->enrollment_number);
        }
    });

    it('filters by interaction: with a conversation (read or not) and with unread messages', function () {
        expect(sentIds($this, '?interaction=conversation'))->toBe([$this->old->id])
            ->and(sentIds($this, '?interaction=unread'))->toBe([])
            ->and(sentIds($this, '?interaction=all'))->toHaveCount(3)
            ->and(sentIds($this, '?interaction=conversation&q=redes'))->toBe([]);
    });

    it('rejects an invalid sort, interaction or a search that is too long', function () {
        $this->browserRequest('GET', '/api/linkage-requests?sort=name')->assertUnprocessable()
            ->assertJsonValidationErrors(['sort' => 'El orden no es válido.']);
        $this->browserRequest('GET', '/api/linkage-requests?interaction=read')->assertUnprocessable()
            ->assertJsonValidationErrors(['interaction' => 'El filtro de conversación no es válido.']);
        $this->browserRequest('GET', '/api/linkage-requests?q='.str_repeat('a', 101))->assertUnprocessable()
            ->assertJsonValidationErrors(['q' => 'La búsqueda admite hasta 100 caracteres.']);
    });
});

describe('detalle (HU-S13-02 CA-01)', function () {
    it('returns its own request with exactly the inbox fields', function () {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student, 'ACEPTADA');
        $this->loginWithCookies($this->account)->assertOk();

        $inbox = $this->browserRequest('GET', '/api/linkage-requests')->assertOk()->json('data.0');
        $detail = $this->browserRequest('GET', '/api/linkage-requests/'.$linkage->id)
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private');

        expect($detail->json('data'))->toBe($inbox)
            ->and($detail->json('data.profile.public_id'))->toBe($this->student->public_id)
            ->and($detail->json('data.institution.contact_email'))->toBe('dual@utgolfo.edu.mx');
        foreach (['student_id', 'Nombre Secreto', 'Apellido Secreto', 'enrollment_number', 'responded_by', 'last_read_message_id'] as $secret) {
            expect($detail->getContent())->not->toContain($secret);
        }
    });

    it('answers 404 for another company request exactly like a missing one', function () {
        $foreign = inboxLinkage($other = Company::factory()->create(), inboxOpportunity($other, 'Ajena'), $this->student);
        $this->loginWithCookies($this->account)->assertOk();

        foreach ([$foreign->id, 999999] as $id) {
            $this->browserRequest('GET', '/api/linkage-requests/'.$id)->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
        }
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('GET', '/api/linkage-requests/'.$id)->assertNotFound();
    })->with(['0', 'abc', '-1', '1234567890123456789']);

    it('forbids every other role', function (UserRole $role) {
        $linkage = inboxLinkage($this->company, $this->opportunity, $this->student);
        $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution($this->institution)->create() : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('GET', '/api/linkage-requests/'.$linkage->id)->assertForbidden();
    })->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::SECRETARY]);
});
