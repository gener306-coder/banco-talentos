<?php

use App\Enums\LinkageParty;
use App\Jobs\NotifyLinkageMessage;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageMessage;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use App\Notifications\LinkageMessageReceived;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\Support\InteractsWithCookieSessions;

// HU-S13-05: aviso agrupado por correo de los mensajes sin leer de una conversación.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    config(['app.frontend_url' => 'https://banco.example']);
    $this->institution = Institution::factory()->create(['name' => 'Universidad Tecnológica de Victoria']);
    $this->institutionAccount = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual UT']);
    $this->institutionColleague = User::factory()->forInstitution($this->institution)->create(['name' => 'Vinculación UT']);
    $this->company = Company::factory()->create(['trade_name' => 'Manufacturas del Norte']);
    $this->companyAccount = User::factory()->forCompany($this->company)->create(['name' => 'Reclutamiento MN']);
    $this->student = noticeStudent($this->institution);
    $this->linkage = noticeLinkage($this->company, noticeOpportunity($this->company, 'Tableros de producción'), $this->student);
});

function noticeStudent(Institution $institution): Student
{
    $student = Student::factory()->for($institution)->withIdentity(['given_names' => 'Nombre Secreto', 'first_surname' => 'Apellido Secreto'])->create();
    DB::table('students')->where('id', $student->id)->update(['program' => 'Ingeniería en Datos', 'headline' => 'Analista de datos']);

    return $student->fresh();
}

function noticeOpportunity(Company $company, string $title): Opportunity
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

function noticeLinkage(Company $company, Opportunity $opportunity, Student $student): LinkageRequest
{
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = User::factory()->forCompany($company)->create()->id;
    $linkage->status = 'ACEPTADA';
    $linkage->responded_by = User::factory()->forInstitution($student->institution)->create()->id;
    $linkage->responded_at = now();
    $linkage->save();

    return $linkage->refresh();
}

function noticeMessage(LinkageRequest $linkage, User $sender, string $body): LinkageMessage
{
    $message = new LinkageMessage(['body' => $body]);
    $message->linkage_request_id = $linkage->id;
    $message->sender_party = $sender->company_id !== null ? 'COMPANY' : 'INSTITUTION';
    $message->sender_user_id = $sender->id;
    $message->save();

    return $message->refresh();
}

/** Ejecuta el aviso tal como lo haría el worker. */
function runNotice(LinkageRequest $linkage, LinkageParty $recipient, LinkageMessage $message): void
{
    (new NotifyLinkageMessage($linkage->id, $recipient, $message->id))->handle();
}

describe('encolado (CA-01)', function () {
    it('queues a delayed notice for the other side when a message is sent', function (string $side) {
        Queue::fake();
        [$sender, $recipient, $uri] = $side === 'empresa'
            ? [$this->companyAccount, LinkageParty::INSTITUTION, "/api/linkage-requests/{$this->linkage->id}/messages"]
            : [$this->institutionAccount, LinkageParty::COMPANY, "/api/institution/linkage-requests/{$this->linkage->id}/messages"];
        $this->freezeSecond();
        $this->loginWithCookies($sender)->assertOk();

        $id = $this->browserRequest('POST', $uri, ['body' => 'Hola'])->assertCreated()->json('data.id');

        Queue::assertPushed(NotifyLinkageMessage::class, 1);
        Queue::assertPushed(NotifyLinkageMessage::class, fn (NotifyLinkageMessage $job): bool => $job->linkageRequestId === $this->linkage->id
            && $job->recipient === $recipient && $job->messageId === $id
            && $job->delay->equalTo(now()->addMinutes(NotifyLinkageMessage::DELAY_MINUTES)));
    })->with(['empresa', 'institución']);

    it('queues nothing when the message is rejected', function () {
        Queue::fake();
        $this->loginWithCookies($this->companyAccount)->assertOk();

        $this->browserRequest('POST', "/api/linkage-requests/{$this->linkage->id}/messages", ['body' => ''])->assertUnprocessable();
        Queue::assertNothingPushed();
    });
});

describe('envío y contenido (CA-01, CA-03)', function () {
    it('mails the active accounts of the receiving side only', function () {
        Notification::fake();
        $inactive = User::factory()->forInstitution($this->institution)->create(['is_active' => false]);
        $pendingSetup = User::factory()->forInstitution($this->institution)->create(['password_setup_required' => true]);
        $otherInstitution = User::factory()->forInstitution(Institution::factory()->create())->create();
        $message = noticeMessage($this->linkage, $this->companyAccount, 'Hola');

        runNotice($this->linkage, LinkageParty::INSTITUTION, $message);

        Notification::assertSentTo([$this->institutionAccount, $this->institutionColleague], LinkageMessageReceived::class);
        Notification::assertNotSentTo([$inactive, $pendingSetup, $otherInstitution, $this->companyAccount], LinkageMessageReceived::class);
        expect($this->linkage->refresh()->institution_notified_at)->not->toBeNull();
    });

    it('names the sender organization and the opportunity and links to the detail of each side', function (string $recipientSide) {
        Notification::fake();
        [$sender, $recipient, $party, $name, $url] = $recipientSide === 'institución'
            ? [$this->companyAccount, $this->institutionAccount, LinkageParty::INSTITUTION, 'Manufacturas del Norte', "https://banco.example/institution/linkage-requests/{$this->linkage->id}"]
            : [$this->institutionAccount, $this->companyAccount, LinkageParty::COMPANY, 'Universidad Tecnológica de Victoria', "https://banco.example/linkage-requests/{$this->linkage->id}"];
        runNotice($this->linkage, $party, noticeMessage($this->linkage, $sender, 'Texto confidencial del mensaje'));

        Notification::assertSentTo($recipient, LinkageMessageReceived::class, function (LinkageMessageReceived $notification) use ($recipient, $name, $url): bool {
            $mail = $notification->toMail($recipient);
            $rendered = (string) $mail->render();
            expect($mail->subject)->toBe("Tienes mensajes nuevos de {$name} — Banco de Talentos")
                ->and($mail->actionUrl)->toBe($url)
                ->and($rendered)->toContain('Tableros de producción')
                ->and($rendered)->not->toContain('Texto confidencial del mensaje')
                ->and($rendered)->not->toContain('Nombre Secreto')
                ->and($rendered)->not->toContain('Apellido Secreto')
                ->and($rendered)->not->toContain($this->student->public_id)
                ->and($rendered)->not->toContain('Analista de datos');

            return true;
        });
    })->with(['institución', 'empresa']);
});

describe('cancelación al leer (CA-01)', function () {
    it('sends nothing if the receiving side already read the message', function () {
        Notification::fake();
        $message = noticeMessage($this->linkage, $this->companyAccount, 'Hola');
        $this->loginWithCookies($this->institutionColleague)->assertOk();
        $this->browserRequest('POST', "/api/institution/linkage-requests/{$this->linkage->id}/messages/read", ['last_read_message_id' => $message->id])->assertOk();

        runNotice($this->linkage, LinkageParty::INSTITUTION, $message);

        Notification::assertNothingSent();
        expect($this->linkage->refresh()->institution_notified_at)->toBeNull();
    });

    it('still notices a newer unread message although an older one was read', function () {
        Notification::fake();
        $read = noticeMessage($this->linkage, $this->companyAccount, 'Uno');
        DB::table('linkage_requests')->where('id', $this->linkage->id)->update(['institution_last_read_message_id' => $read->id]);
        $unread = noticeMessage($this->linkage, $this->companyAccount, 'Dos');

        runNotice($this->linkage, LinkageParty::INSTITUTION, $unread);

        Notification::assertSentTo($this->institutionAccount, LinkageMessageReceived::class);
    });

    it('sends nothing when the receiving organization is inactive', function () {
        Notification::fake();
        $this->institution->forceFill(['is_active' => false])->save();

        runNotice($this->linkage, LinkageParty::INSTITUTION, noticeMessage($this->linkage, $this->companyAccount, 'Hola'));

        Notification::assertNothingSent();
    });
});

describe('agrupación (CA-02)', function () {
    it('sends at most one notice per conversation and side every 6 hours while unread', function () {
        Notification::fake();
        $this->freezeSecond();
        $first = noticeMessage($this->linkage, $this->companyAccount, 'Uno');
        $second = noticeMessage($this->linkage, $this->companyAccount, 'Dos');

        runNotice($this->linkage, LinkageParty::INSTITUTION, $first);
        runNotice($this->linkage, LinkageParty::INSTITUTION, $second);
        Notification::assertSentToTimes($this->institutionAccount, LinkageMessageReceived::class, 1);

        $this->travel(5)->hours();
        runNotice($this->linkage, LinkageParty::INSTITUTION, noticeMessage($this->linkage, $this->companyAccount, 'Tres'));
        Notification::assertSentToTimes($this->institutionAccount, LinkageMessageReceived::class, 1);

        $this->travel(1)->hours();
        runNotice($this->linkage, LinkageParty::INSTITUTION, noticeMessage($this->linkage, $this->companyAccount, 'Cuatro'));
        Notification::assertSentToTimes($this->institutionAccount, LinkageMessageReceived::class, 2);
    });

    it('keeps the windows of each side apart', function () {
        Notification::fake();
        runNotice($this->linkage, LinkageParty::INSTITUTION, noticeMessage($this->linkage, $this->companyAccount, 'De la empresa'));
        runNotice($this->linkage, LinkageParty::COMPANY, noticeMessage($this->linkage, $this->institutionAccount, 'De la institución'));

        Notification::assertSentToTimes($this->institutionAccount, LinkageMessageReceived::class, 1);
        Notification::assertSentToTimes($this->companyAccount, LinkageMessageReceived::class, 1);
    });

    it('opens a new window once the side reads, and when it replies', function (string $how) {
        Notification::fake();
        runNotice($this->linkage, LinkageParty::INSTITUTION, $first = noticeMessage($this->linkage, $this->companyAccount, 'Uno'));
        $this->loginWithCookies($this->institutionAccount)->assertOk();
        $how === 'lee'
            ? $this->browserRequest('POST', "/api/institution/linkage-requests/{$this->linkage->id}/messages/read", ['last_read_message_id' => $first->id])->assertOk()
            : $this->browserRequest('POST', "/api/institution/linkage-requests/{$this->linkage->id}/messages", ['body' => 'Respuesta'])->assertCreated();
        expect($this->linkage->refresh()->institution_notified_at)->toBeNull();

        runNotice($this->linkage, LinkageParty::INSTITUTION, noticeMessage($this->linkage, $this->companyAccount, 'Dos'));
        Notification::assertSentToTimes($this->institutionAccount, LinkageMessageReceived::class, 2);
    })->with(['lee', 'responde']);

    it('releases the claimed notice when the mail fails so the retry can send it', function () {
        $message = noticeMessage($this->linkage, $this->companyAccount, 'Hola');
        Notification::shouldReceive('send')->once()->andThrow(new RuntimeException('SMTP caído'));

        expect(fn () => runNotice($this->linkage, LinkageParty::INSTITUTION, $message))->toThrow(RuntimeException::class, 'SMTP caído');
        expect($this->linkage->refresh()->institution_notified_at)->toBeNull();
    });
});
