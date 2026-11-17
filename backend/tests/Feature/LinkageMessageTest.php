<?php

use App\Enums\UserRole;
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

// HU-S13-01: conversación de una solicitud de vinculación aceptada entre la empresa y la institución.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create(['name' => 'Universidad Tecnológica de Victoria']);
    $this->institutionAccount = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual UT']);
    $this->institutionColleague = User::factory()->forInstitution($this->institution)->create(['name' => 'Vinculación UT']);
    $this->company = Company::factory()->create(['trade_name' => 'Manufacturas del Norte']);
    $this->companyAccount = User::factory()->forCompany($this->company)->create(['name' => 'Reclutamiento MN']);
    $this->companyColleague = User::factory()->forCompany($this->company)->create(['name' => 'Recursos Humanos MN']);
    $this->student = messageStudent($this->institution);
    $this->opportunity = messageOpportunity($this->company, 'Tableros de producción');
    $this->linkage = messageLinkage($this->company, $this->opportunity, $this->student, 'ACEPTADA');
});

function messageStudent(Institution $institution): Student
{
    $student = Student::factory()->for($institution)->withIdentity(['given_names' => 'Nombre Secreto', 'first_surname' => 'Apellido Secreto'])->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false, 'headline' => 'Analista de datos',
    ]);

    return $student->fresh();
}

function messageOpportunity(Company $company, string $title): Opportunity
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

function messageLinkage(Company $company, Opportunity $opportunity, Student $student, string $status): LinkageRequest
{
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = User::factory()->forCompany($company)->create()->id;
    $linkage->status = $status;
    if (in_array($status, ['ACEPTADA', 'RECHAZADA'], true)) {
        $linkage->responded_by = User::factory()->forInstitution($student->institution)->create()->id;
        $linkage->responded_at = now();
    }
    $linkage->save();

    return $linkage->refresh();
}

/** Ruta de la conversación según el lado de la cuenta: la empresa y la institución tienen la suya. */
function messagesUri(User $user, LinkageRequest|int|string $linkage, string $suffix = ''): string
{
    $id = $linkage instanceof LinkageRequest ? $linkage->id : $linkage;
    $prefix = $user->role === UserRole::COMPANY ? '/api/linkage-requests' : '/api/institution/linkage-requests';

    return "{$prefix}/{$id}/messages{$suffix}";
}

function sendMessage($test, User $user, LinkageRequest|int $linkage, array $body, bool $csrf = true)
{
    return $test->browserRequest('POST', messagesUri($user, $linkage), $body, csrf: $csrf);
}

function listMessages($test, User $user, LinkageRequest|int $linkage, string $query = '')
{
    return $test->browserRequest('GET', messagesUri($user, $linkage).$query);
}

function markRead($test, User $user, LinkageRequest|int $linkage, array $body, bool $csrf = true)
{
    return $test->browserRequest('POST', messagesUri($user, $linkage, '/read'), $body, csrf: $csrf);
}

/** Mensaje insertado directamente, para preparar conversaciones sin pasar por el límite de envío. */
function seedMessage(LinkageRequest $linkage, User $sender, string $body): LinkageMessage
{
    $message = new LinkageMessage(['body' => $body]);
    $message->linkage_request_id = $linkage->id;
    $message->sender_party = $sender->role === UserRole::COMPANY ? 'COMPANY' : 'INSTITUTION';
    $message->sender_user_id = $sender->id;
    $message->save();

    return $message->refresh();
}

describe('acceso', function () {
    it('rejects visitors', function () {
        $this->startCookieSession();

        foreach (['/api/linkage-requests', '/api/institution/linkage-requests'] as $prefix) {
            $this->browserRequest('GET', "{$prefix}/{$this->linkage->id}/messages")->assertUnauthorized();
            $this->browserRequest('POST', "{$prefix}/{$this->linkage->id}/messages", ['body' => 'Hola'])->assertUnauthorized();
            $this->browserRequest('POST', "{$prefix}/{$this->linkage->id}/messages/read", ['last_read_message_id' => 1])->assertUnauthorized();
        }
        expect(LinkageMessage::count())->toBe(0);
    });

    it('forbids admin and secretary accounts on both sides', function (UserRole $role) {
        seedMessage($this->linkage, $this->companyAccount, 'Contenido privado');
        $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();

        foreach (['/api/linkage-requests', '/api/institution/linkage-requests'] as $prefix) {
            $this->browserRequest('GET', "{$prefix}/{$this->linkage->id}/messages")->assertForbidden();
            $this->browserRequest('POST', "{$prefix}/{$this->linkage->id}/messages", ['body' => 'Hola'])->assertForbidden();
        }
        expect(LinkageMessage::count())->toBe(1);
    })->with([UserRole::ADMIN, UserRole::SECRETARY]);

    it('keeps each side on its own routes', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('GET', "/api/institution/linkage-requests/{$this->linkage->id}/messages")->assertForbidden();

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $this->browserRequest('GET', "/api/linkage-requests/{$this->linkage->id}/messages")->assertForbidden();
    });

    it('requires CSRF to send and to mark as read', function () {
        $message = seedMessage($this->linkage, $this->institutionAccount, 'Hola');
        $this->loginWithCookies($this->companyAccount)->assertOk();

        sendMessage($this, $this->companyAccount, $this->linkage, ['body' => 'Hola'], csrf: false)->assertStatus(419);
        markRead($this, $this->companyAccount, $this->linkage, ['last_read_message_id' => $message->id], csrf: false)->assertStatus(419);
        expect(LinkageMessage::count())->toBe(1)
            ->and($this->linkage->refresh()->company_last_read_message_id)->toBeNull();
    });
});

describe('envío y lectura', function () {
    it('lets both sides exchange messages in chronological order', function (string $first) {
        $this->freezeSecond();
        [$a, $b] = $first === 'empresa' ? [$this->companyAccount, $this->institutionAccount] : [$this->institutionAccount, $this->companyAccount];

        $this->loginWithCookies($a)->assertOk();
        $sent = sendMessage($this, $a, $this->linkage, ['body' => '  Primer mensaje.  '])
            ->assertCreated()->assertHeader('Cache-Control', 'no-store, private');
        expect($sent->json('data'))->toMatchArray(['body' => 'Primer mensaje.', 'is_own' => true, 'created_at' => now()->toISOString()]);

        $this->loginWithCookies($b)->assertOk();
        sendMessage($this, $b, $this->linkage, ['body' => 'Respuesta.'])->assertCreated();

        $thread = listMessages($this, $b, $this->linkage)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        expect(array_column($thread->json('data'), 'body'))->toBe(['Primer mensaje.', 'Respuesta.'])
            ->and(array_column($thread->json('data'), 'is_own'))->toBe([false, true])
            ->and($thread->json('meta'))->toMatchArray(['has_more' => false, 'can_write' => true]);
        expect($this->linkage->refresh()->last_message_at->equalTo(now()))->toBeTrue();
    })->with(['empresa', 'institución']);

    it('names the organization of each message and the account only on its own side', function () {
        seedMessage($this->linkage, $this->companyAccount, 'De la empresa');
        seedMessage($this->linkage, $this->institutionAccount, 'De la institución');

        $this->loginWithCookies($this->companyColleague)->assertOk();
        $company = listMessages($this, $this->companyColleague, $this->linkage)->assertOk()->json('data');
        expect($company[0])->toBe([
            'id' => $company[0]['id'], 'sender_party' => 'COMPANY', 'sender_name' => 'Manufacturas del Norte', 'is_own' => true,
            'account_name' => 'Reclutamiento MN', 'body' => 'De la empresa', 'created_at' => $company[0]['created_at'],
        ])->and($company[1])->toMatchArray([
            'sender_party' => 'INSTITUTION', 'sender_name' => 'Universidad Tecnológica de Victoria', 'is_own' => false, 'account_name' => null,
        ]);

        $this->loginWithCookies($this->institutionColleague)->assertOk();
        $institution = listMessages($this, $this->institutionColleague, $this->linkage)->assertOk()->json('data');
        expect($institution[0])->toMatchArray(['sender_name' => 'Manufacturas del Norte', 'is_own' => false, 'account_name' => null])
            ->and($institution[1])->toMatchArray(['sender_name' => 'Universidad Tecnológica de Victoria', 'is_own' => true, 'account_name' => 'Coordinación Dual UT']);
    });

    it('uses the legal name when the company has no trade name', function () {
        $this->company->forceFill(['trade_name' => null, 'legal_name' => 'Manufacturas del Norte SA de CV'])->save();
        seedMessage($this->linkage, $this->companyAccount, 'Hola');
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        listMessages($this, $this->institutionAccount, $this->linkage)->assertOk()
            ->assertJsonPath('data.0.sender_name', 'Manufacturas del Norte SA de CV');
    });

    it('never exposes the sender account, the student or the read markers of the other side', function () {
        seedMessage($this->linkage, $this->institutionAccount, 'Hola');
        seedMessage($this->linkage, $this->companyAccount, 'Hola de vuelta');
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $body = listMessages($this, $this->companyAccount, $this->linkage)->assertOk()->getContent();
        foreach (['sender_user_id', 'student_id', 'institution_last_read_message_id', 'company_last_read_message_id', 'Nombre Secreto', 'Coordinación Dual UT', $this->institutionAccount->email] as $secret) {
            expect($body)->not->toContain($secret);
        }
    });

    it('fixes the side and the account on the server', function () {
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        sendMessage($this, $this->institutionAccount, $this->linkage, ['body' => 'Hola'])->assertCreated();

        $message = LinkageMessage::sole();
        expect($message->sender_party->value)->toBe('INSTITUTION')
            ->and($message->sender_user_id)->toBe($this->institutionAccount->id)
            ->and($message->linkage_request_id)->toBe($this->linkage->id);
    });

    it('does not change the request updated_at when a message arrives', function () {
        $updatedAt = $this->linkage->updated_at;
        $this->travel(5)->minutes();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        sendMessage($this, $this->companyAccount, $this->linkage, ['body' => 'Hola'])->assertCreated();
        expect($this->linkage->refresh()->updated_at->equalTo($updatedAt))->toBeTrue();
    });

    it('pages the thread 100 at a time and resumes after a given message', function () {
        $messages = collect(range(1, 102))->map(fn (int $n) => seedMessage($this->linkage, $n % 2 ? $this->companyAccount : $this->institutionAccount, "Mensaje {$n}"));
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $first = listMessages($this, $this->companyAccount, $this->linkage)->assertOk();
        expect($first->json('data'))->toHaveCount(100)
            ->and($first->json('data.99.body'))->toBe('Mensaje 100')
            ->and($first->json('meta.has_more'))->toBeTrue();

        $rest = listMessages($this, $this->companyAccount, $this->linkage, '?after='.$first->json('data.99.id'))->assertOk();
        expect(array_column($rest->json('data'), 'body'))->toBe(['Mensaje 101', 'Mensaje 102'])
            ->and($rest->json('meta.has_more'))->toBeFalse();

        listMessages($this, $this->companyAccount, $this->linkage, '?after='.$messages->last()->id)->assertOk()->assertJsonPath('data', []);
    });

    it('validates the after parameter', function (string $after) {
        $this->loginWithCookies($this->companyAccount)->assertOk();

        listMessages($this, $this->companyAccount, $this->linkage, "?after={$after}")->assertUnprocessable()
            ->assertJsonValidationErrors(['after' => 'El mensaje de referencia no es válido.']);
    })->with(['abc', '-1', '1234567890123456789']);

    it('validates the message', function (array $body, string $field, string $message) {
        $this->loginWithCookies($this->companyAccount)->assertOk();

        sendMessage($this, $this->companyAccount, $this->linkage, $body)->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
        expect(LinkageMessage::count())->toBe(0);
    })->with([
        'vacío' => [[], 'body', 'Escribe un mensaje.'],
        'solo espacios' => [['body' => "   \n  "], 'body', 'Escribe un mensaje.'],
        'no texto' => [['body' => 5], 'body', 'El mensaje no es válido.'],
        'arreglo' => [['body' => ['Hola']], 'body', 'El mensaje no es válido.'],
        'largo' => [['body' => str_repeat('a', 2001)], 'body', 'El mensaje no debe superar 2000 caracteres.'],
        'lado' => [['body' => 'Hola', 'sender_party' => 'INSTITUTION'], 'sender_party', 'El mensaje solo admite el texto.'],
        'cuenta' => [['body' => 'Hola', 'sender_user_id' => 1], 'sender_user_id', 'El mensaje solo admite el texto.'],
        'solicitud' => [['body' => 'Hola', 'linkage_request_id' => 1], 'linkage_request_id', 'El mensaje solo admite el texto.'],
    ]);

    it('allows the 2000 character limit, multibyte included', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();

        sendMessage($this, $this->companyAccount, $this->linkage, ['body' => str_repeat('ñ', 2000)])->assertCreated();
    });

    it('limits sending to 30 messages per minute per account', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();

        foreach (range(1, 30) as $n) {
            sendMessage($this, $this->companyAccount, $this->linkage, ['body' => "Mensaje {$n}"])->assertCreated();
        }
        sendMessage($this, $this->companyAccount, $this->linkage, ['body' => 'Uno más'])->assertTooManyRequests();
        expect(LinkageMessage::count())->toBe(30);

        // Leer la conversación no consume el límite de envío.
        listMessages($this, $this->companyAccount, $this->linkage)->assertOk();
    });
});

describe('aislamiento', function () {
    it('answers 404 to another company exactly like a missing request', function () {
        seedMessage($this->linkage, $this->institutionAccount, 'Contenido privado');
        $intruder = User::factory()->forCompany(Company::factory()->create())->create();
        $this->loginWithCookies($intruder)->assertOk();

        foreach ([$this->linkage->id, 999999] as $id) {
            listMessages($this, $intruder, $id)->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
            sendMessage($this, $intruder, $id, ['body' => 'Intruso'])->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
            markRead($this, $intruder, $id, ['last_read_message_id' => 1])->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
        }
        expect(LinkageMessage::count())->toBe(1)
            ->and($this->linkage->refresh()->company_last_read_message_id)->toBeNull();
    });

    it('answers 404 to another institution exactly like a missing request', function () {
        seedMessage($this->linkage, $this->companyAccount, 'Contenido privado');
        $intruder = User::factory()->forInstitution(Institution::factory()->create())->create();
        $this->loginWithCookies($intruder)->assertOk();

        foreach ([$this->linkage->id, 999999] as $id) {
            listMessages($this, $intruder, $id)->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
            sendMessage($this, $intruder, $id, ['body' => 'Intruso'])->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
            markRead($this, $intruder, $id, ['last_read_message_id' => 1])->assertNotFound()->assertExactJson(['message' => 'La solicitud no existe.']);
        }
        expect(LinkageMessage::count())->toBe(1)
            ->and($this->linkage->refresh()->institution_last_read_message_id)->toBeNull();
    });

    it('only lists the messages of the requested conversation', function () {
        $other = messageLinkage($this->company, messageOpportunity($this->company, 'Otra'), $this->student, 'ACEPTADA');
        seedMessage($this->linkage, $this->companyAccount, 'De esta');
        $foreign = seedMessage($other, $this->companyAccount, 'De la otra');
        $this->loginWithCookies($this->companyAccount)->assertOk();

        expect(array_column(listMessages($this, $this->companyAccount, $this->linkage)->assertOk()->json('data'), 'body'))->toBe(['De esta']);
        markRead($this, $this->companyAccount, $this->linkage, ['last_read_message_id' => $foreign->id])->assertUnprocessable()
            ->assertJsonValidationErrors(['last_read_message_id' => 'El mensaje no pertenece a esta conversación.']);
        expect($this->linkage->refresh()->company_last_read_message_id)->toBeNull();
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('GET', "/api/linkage-requests/{$id}/messages")->assertNotFound();
        $this->browserRequest('POST', "/api/linkage-requests/{$id}/messages", ['body' => 'Hola'])->assertNotFound();
    })->with(['0', 'abc', '-1', '1234567890123456789']);
});

describe('estado de la solicitud', function () {
    it('only opens the conversation of an accepted request', function (string $status, string $side) {
        $linkage = messageLinkage($this->company, messageOpportunity($this->company, 'B'), $this->student, $status);
        $user = $side === 'empresa' ? $this->companyAccount : $this->institutionAccount;
        $this->loginWithCookies($user)->assertOk();
        $error = ['status' => 'La conversación solo está disponible en solicitudes aceptadas.'];

        listMessages($this, $user, $linkage)->assertUnprocessable()->assertJsonValidationErrors($error);
        sendMessage($this, $user, $linkage, ['body' => 'Hola'])->assertUnprocessable()->assertJsonValidationErrors($error);
        markRead($this, $user, $linkage, ['last_read_message_id' => 1])->assertUnprocessable()->assertJsonValidationErrors($error);
        expect(LinkageMessage::count())->toBe(0)
            ->and($linkage->refresh()->last_message_at)->toBeNull();
    })->with(['PENDIENTE_INSTITUCION', 'RECHAZADA', 'CANCELADA'])->with(['empresa', 'institución']);

    it('becomes read only when the institution is deactivated', function () {
        $message = seedMessage($this->linkage, $this->institutionAccount, 'Último mensaje');
        $this->institution->forceFill(['is_active' => false])->save();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        listMessages($this, $this->companyAccount, $this->linkage)->assertOk()
            ->assertJsonPath('meta.can_write', false)->assertJsonPath('data.0.body', 'Último mensaje');
        sendMessage($this, $this->companyAccount, $this->linkage, ['body' => 'Hola'])->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'La conversación es de solo lectura: la otra organización ya no está activa.']);
        markRead($this, $this->companyAccount, $this->linkage, ['last_read_message_id' => $message->id])->assertOk();
        expect(LinkageMessage::count())->toBe(1);
    });

    it('becomes read only when the company is deactivated', function () {
        seedMessage($this->linkage, $this->companyAccount, 'Último mensaje');
        $this->company->forceFill(['is_active' => false])->save();
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        listMessages($this, $this->institutionAccount, $this->linkage)->assertOk()->assertJsonPath('meta.can_write', false);
        sendMessage($this, $this->institutionAccount, $this->linkage, ['body' => 'Hola'])->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'La conversación es de solo lectura: la otra organización ya no está activa.']);
        expect(LinkageMessage::count())->toBe(1);
    });

    it('stays open after the opportunity is deactivated', function () {
        $this->opportunity->forceFill(['is_active' => false])->save();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        listMessages($this, $this->companyAccount, $this->linkage)->assertOk()->assertJsonPath('meta.can_write', true);
        sendMessage($this, $this->companyAccount, $this->linkage, ['body' => 'Seguimos coordinando'])->assertCreated();
    });
});

describe('marcadores de lectura', function () {
    it('shares the read marker among the accounts of the same side', function () {
        $first = seedMessage($this->linkage, $this->companyAccount, 'Uno');
        $second = seedMessage($this->linkage, $this->companyAccount, 'Dos');

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        listMessages($this, $this->institutionAccount, $this->linkage)->assertOk()->assertJsonPath('meta.last_read_message_id', null);
        markRead($this, $this->institutionAccount, $this->linkage, ['last_read_message_id' => $second->id])
            ->assertOk()->assertExactJson(['data' => ['last_read_message_id' => $second->id]]);

        $this->loginWithCookies($this->institutionColleague)->assertOk();
        listMessages($this, $this->institutionColleague, $this->linkage)->assertOk()->assertJsonPath('meta.last_read_message_id', $second->id);

        // El lado de la empresa conserva su propio marcador.
        $this->loginWithCookies($this->companyAccount)->assertOk();
        listMessages($this, $this->companyAccount, $this->linkage)->assertOk()->assertJsonPath('meta.last_read_message_id', null);
        expect($this->linkage->refresh())
            ->institution_last_read_message_id->toBe($second->id)
            ->company_last_read_message_id->toBeNull();
        expect($first->id)->toBeLessThan($second->id);
    });

    it('never moves the marker backwards', function () {
        $first = seedMessage($this->linkage, $this->companyAccount, 'Uno');
        $second = seedMessage($this->linkage, $this->companyAccount, 'Dos');
        $this->loginWithCookies($this->institutionAccount)->assertOk();

        markRead($this, $this->institutionAccount, $this->linkage, ['last_read_message_id' => $second->id])->assertOk();
        markRead($this, $this->institutionAccount, $this->linkage, ['last_read_message_id' => $first->id])
            ->assertOk()->assertExactJson(['data' => ['last_read_message_id' => $second->id]]);
        expect($this->linkage->refresh()->institution_last_read_message_id)->toBe($second->id);
    });

    it('marks everything before as read for the side that sends', function () {
        seedMessage($this->linkage, $this->institutionAccount, 'Pregunta');
        $this->loginWithCookies($this->companyColleague)->assertOk();

        $sent = sendMessage($this, $this->companyColleague, $this->linkage, ['body' => 'Respuesta'])->assertCreated();
        expect($this->linkage->refresh())
            ->company_last_read_message_id->toBe($sent->json('data.id'))
            ->institution_last_read_message_id->toBeNull();
    });

    it('validates the read marker', function (array $body, string $field, string $message) {
        $this->loginWithCookies($this->companyAccount)->assertOk();

        markRead($this, $this->companyAccount, $this->linkage, $body)->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
        expect($this->linkage->refresh()->company_last_read_message_id)->toBeNull();
    })->with([
        'vacío' => [[], 'last_read_message_id', 'Indica el último mensaje leído.'],
        'texto' => [['last_read_message_id' => 'abc'], 'last_read_message_id', 'El mensaje no es válido.'],
        'cero' => [['last_read_message_id' => 0], 'last_read_message_id', 'El mensaje no es válido.'],
        'inexistente' => [['last_read_message_id' => 999999], 'last_read_message_id', 'El mensaje no pertenece a esta conversación.'],
        'campo extra' => [['last_read_message_id' => 1, 'institution_last_read_message_id' => 1], 'institution_last_read_message_id', 'Solo se indica el último mensaje leído.'],
    ]);
});

describe('integridad', function () {
    it('keeps messages immutable in the model and in the database', function () {
        $message = seedMessage($this->linkage, $this->companyAccount, 'Acordado');

        expect(fn () => $message->forceFill(['body' => 'Cambiado'])->save())->toThrow(LogicException::class)
            ->and(fn () => $message->delete())->toThrow(LogicException::class)
            // Cada intento en su propio savepoint: un error de PostgreSQL aborta la transacción de la prueba.
            ->and(fn () => DB::transaction(fn () => DB::table('linkage_messages')->where('id', $message->id)->update(['body' => 'Cambiado'])))
            ->toThrow(QueryException::class, 'Los mensajes de vinculación no se editan ni se borran.')
            ->and(fn () => DB::transaction(fn () => DB::table('linkage_messages')->where('id', $message->id)->delete()))
            ->toThrow(QueryException::class, 'Los mensajes de vinculación no se editan ni se borran.');
        expect(DB::table('linkage_messages')->where('id', $message->id)->value('body'))->toBe('Acordado');
    });

    it('enforces the side and a non blank body in the database', function () {
        $row = ['linkage_request_id' => $this->linkage->id, 'sender_user_id' => $this->companyAccount->id, 'created_at' => now()];

        expect(fn () => DB::transaction(fn () => DB::table('linkage_messages')->insert($row + ['sender_party' => 'STUDENT', 'body' => 'Hola'])))
            ->toThrow(QueryException::class, 'linkage_messages_sender_party_check')
            ->and(fn () => DB::transaction(fn () => DB::table('linkage_messages')->insert($row + ['sender_party' => 'COMPANY', 'body' => '   '])))
            ->toThrow(QueryException::class, 'linkage_messages_body_check');
        expect(DB::table('linkage_messages')->count())->toBe(0);
    });

    it('exposes no delete or update route for messages', function () {
        $message = seedMessage($this->linkage, $this->companyAccount, 'Acordado');
        $this->loginWithCookies($this->companyAccount)->assertOk();

        foreach (['DELETE', 'PATCH', 'PUT'] as $method) {
            $this->browserRequest($method, messagesUri($this->companyAccount, $this->linkage, "/{$message->id}"), ['body' => 'Cambiado'])->assertNotFound();
        }
        expect($message->refresh()->body)->toBe('Acordado');
    });
});

describe('mensajes sin leer (HU-S13-04)', function () {
    /** unread_count de la solicitud en la bandeja del lado de la cuenta. */
    function inboxUnread($test, User $user, LinkageRequest $linkage, string $query = ''): ?int
    {
        $prefix = $user->role === UserRole::COMPANY ? '/api/linkage-requests' : '/api/institution/linkage-requests';
        $items = collect($test->browserRequest('GET', $prefix.$query)->assertOk()->json('data'));

        return $items->firstWhere('id', $linkage->id)['unread_count'] ?? null;
    }

    function unreadSummary($test, User $user)
    {
        $prefix = $user->role === UserRole::COMPANY ? '/api/linkage-requests' : '/api/institution/linkage-requests';

        return $test->browserRequest('GET', "{$prefix}/unread-summary");
    }

    it('counts only the other side messages after the own marker, on each inbox (CA-01, CA-02)', function () {
        seedMessage($this->linkage, $this->companyAccount, 'Uno');
        $second = seedMessage($this->linkage, $this->companyAccount, 'Dos');
        seedMessage($this->linkage, $this->institutionAccount, 'Respuesta');

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        expect(inboxUnread($this, $this->institutionAccount, $this->linkage))->toBe(2);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        expect(inboxUnread($this, $this->companyAccount, $this->linkage))->toBe(1);

        // El marcador es del lado: lo que lee una cuenta de la institución deja leído para su colega.
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        markRead($this, $this->institutionAccount, $this->linkage, ['last_read_message_id' => $second->id])->assertOk();
        $this->loginWithCookies($this->institutionColleague)->assertOk();
        expect(inboxUnread($this, $this->institutionColleague, $this->linkage))->toBe(0);

        // Un mensaje nuevo de la empresa vuelve a contar; los propios nunca.
        seedMessage($this->linkage, $this->companyAccount, 'Tres');
        seedMessage($this->linkage, $this->institutionAccount, 'Otra respuesta');
        expect(inboxUnread($this, $this->institutionColleague, $this->linkage))->toBe(1);
    });

    it('reports zero for requests without a conversation', function () {
        $pending = messageLinkage($this->company, messageOpportunity($this->company, 'B'), $this->student, 'PENDIENTE_INSTITUCION');
        $this->loginWithCookies($this->companyAccount)->assertOk();

        expect(inboxUnread($this, $this->companyAccount, $pending))->toBe(0)
            ->and(inboxUnread($this, $this->companyAccount, $this->linkage))->toBe(0);
    });

    it('includes the unread count in the company detail', function () {
        seedMessage($this->linkage, $this->institutionAccount, 'Hola');
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('GET', '/api/linkage-requests/'.$this->linkage->id)->assertOk()->assertJsonPath('data.unread_count', 1);
    });

    it('filters both inboxes by conversations with unread messages (CA-04)', function () {
        $quiet = messageLinkage($this->company, messageOpportunity($this->company, 'Sin novedades'), $this->student, 'ACEPTADA');
        seedMessage($quiet, $this->companyAccount, 'Solo nuestro');
        seedMessage($quiet, $this->institutionAccount, 'Solo de la institución');
        seedMessage($this->linkage, $this->companyAccount, 'Para la institución');

        $this->loginWithCookies($this->institutionAccount)->assertOk();
        expect(array_column($this->browserRequest('GET', '/api/institution/linkage-requests?unread=1')->assertOk()->json('data'), 'id'))
            ->toEqualCanonicalizing([$this->linkage->id, $quiet->id]);

        $this->loginWithCookies($this->companyAccount)->assertOk();
        expect(array_column($this->browserRequest('GET', '/api/linkage-requests?unread=1')->assertOk()->json('data'), 'id'))->toBe([$quiet->id])
            ->and($this->browserRequest('GET', '/api/linkage-requests?unread=0')->assertOk()->json('data'))->toHaveCount(2);
        $this->browserRequest('GET', '/api/linkage-requests?unread=abc')->assertUnprocessable()
            ->assertJsonValidationErrors(['unread' => 'El filtro de mensajes sin leer no es válido.']);
    });

    it('summarizes the conversations with unread messages of the session organization only (CA-02)', function () {
        $other = messageLinkage($this->company, messageOpportunity($this->company, 'B'), $this->student, 'ACEPTADA');
        seedMessage($this->linkage, $this->institutionAccount, 'Uno');
        seedMessage($this->linkage, $this->institutionAccount, 'Dos');
        seedMessage($other, $this->institutionAccount, 'Tres');
        // Ajena: otra empresa con la misma institución.
        $foreignCompany = Company::factory()->create();
        $foreign = messageLinkage($foreignCompany, messageOpportunity($foreignCompany, 'Ajena'), $this->student, 'ACEPTADA');
        seedMessage($foreign, $this->institutionAccount, 'Para la otra empresa');

        $this->loginWithCookies($this->companyAccount)->assertOk();
        unreadSummary($this, $this->companyAccount)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => ['conversations' => 2]]);

        $intruder = User::factory()->forCompany(Company::factory()->create())->create();
        $this->loginWithCookies($intruder)->assertOk();
        unreadSummary($this, $intruder)->assertOk()->assertExactJson(['data' => ['conversations' => 0]]);

        // La institución no tiene nada sin leer: todo lo escribió ella.
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        unreadSummary($this, $this->institutionAccount)->assertOk()->assertExactJson(['data' => ['conversations' => 0]]);
    });

    it('forbids the summary to admin and secretary accounts', function (UserRole $role) {
        $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();

        $this->browserRequest('GET', '/api/linkage-requests/unread-summary')->assertForbidden();
        $this->browserRequest('GET', '/api/institution/linkage-requests/unread-summary')->assertForbidden();
    })->with([UserRole::ADMIN, UserRole::SECRETARY]);
});
