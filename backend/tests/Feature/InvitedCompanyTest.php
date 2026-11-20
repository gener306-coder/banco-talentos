<?php

use App\Enums\LinkageParty;
use App\Enums\UserRole;
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
use Tests\Support\InteractsWithCookieSessions;

// HU-S14-02 CA-04 y CA-05: ningún consumidor falla con una empresa invitada que aún no captura su perfil.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->secretary = User::factory()->role(UserRole::SECRETARY)->create();
    $this->invited = Company::factory()->invited()->create(['registered_by' => $this->secretary->id]);
    $this->operator = User::factory()->forCompany($this->invited)->create(['email' => 'operador@invitada.test', 'name' => 'operador@invitada.test']);
    $this->institution = Institution::factory()->create(['name' => 'UT del Golfo']);
});

function invitedStudent(Institution $institution, string $municipality, string $headline): Student
{
    $student = Student::factory()->for($institution)->withIdentity()->create();
    DB::table('students')->where('id', $student->id)->update([
        'program' => 'Ingeniería en Datos', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => substr($municipality, 0, 2), 'municipality_code' => $municipality, 'can_relocate' => false, 'headline' => $headline,
    ]);
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    return $student->refresh();
}

/** Solicitud aceptada de una empresa que después vació su nombre y su contacto. */
function invitedLinkage(Institution $institution): LinkageRequest
{
    $company = Company::factory()->create();
    $student = invitedStudent($institution, '28032', 'Analista de datos');
    $opportunity = new Opportunity([
        'title' => 'Tableros de producción', 'program' => 'Ingeniería en Datos', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->save();
    $linkage = new LinkageRequest(['message' => 'Nos interesa su perfil.']);
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $institution->id;
    $linkage->requested_by = $opportunity->created_by;
    $linkage->status = 'ACEPTADA';
    $linkage->responded_by = User::factory()->forInstitution($institution)->create()->id;
    $linkage->responded_at = now();
    $linkage->save();
    $company->update(['legal_name' => null, 'trade_name' => null, 'contact_name' => null, 'contact_position' => null, 'contact_email' => null, 'contact_phone' => null]);

    return $linkage->refresh();
}

describe('lado de la empresa invitada', function () {
    it('signs in with no company name and an empty profile', function () {
        $this->loginWithCookies($this->operator)->assertOk()
            ->assertJsonPath('user.name', 'operador@invitada.test')
            ->assertJsonPath('user.company.id', $this->invited->id)
            ->assertJsonPath('user.company.name', null);
        $this->browserRequest('GET', '/api/organization/profile')->assertOk()
            ->assertJsonPath('data.name', null)->assertJsonPath('data.state_code', null)->assertJsonPath('data.contact_email', null)
            ->assertJsonMissingPath('data.validation_reference');
        $this->browserRequest('GET', '/api/dashboard')->assertOk();
    });

    it('starts the opportunity form with an empty location', function () {
        $this->loginWithCookies($this->operator)->assertOk();
        $this->browserRequest('GET', '/api/opportunities/defaults')->assertOk()
            ->assertExactJson(['data' => ['state_code' => null, 'municipality_code' => null, 'municipality' => null]]);
    });

    it('searches talent without distance, most recently updated first, and asks for an origin to filter by radius', function () {
        $older = invitedStudent($this->institution, '28041', 'Perfil anterior');
        $newer = invitedStudent($this->institution, '19039', 'Perfil reciente');
        DB::table('students')->where('id', $older->id)->update(['updated_at' => now()->subDay()]);
        $this->loginWithCookies($this->operator)->assertOk();

        $cards = $this->browserRequest('GET', '/api/talent')->assertOk()->json('data');
        expect(array_column($cards, 'headline'))->toBe(['Perfil reciente', 'Perfil anterior'])
            ->and(array_column($cards, 'distance_km'))->toBe([null, null]);
        $this->browserRequest('GET', '/api/talent?radius_km=50')->assertUnprocessable()
            ->assertJsonValidationErrors(['radius_km' => 'Elige un municipio de origen para filtrar por distancia.']);

        // Con un municipio de origen explícito, la distancia y el radio funcionan como siempre.
        $near = $this->browserRequest('GET', '/api/talent?radius_km=50&origin_municipality_code=19039')->assertOk()->json('data');
        expect(array_column($near, 'headline'))->toBe(['Perfil reciente'])->and($near[0]['distance_km'])->toBe(0);
        $this->browserRequest('GET', '/api/talent/'.$newer->public_id)->assertOk()->assertJsonPath('data.headline', 'Perfil reciente');
    });
});

describe('lado de la Secretaría', function () {
    it('keeps the executive report and its CSV working, grouping the empty sector', function () {
        Company::factory()->create(['sector_code' => '54']);
        $this->loginWithCookies($this->secretary)->assertOk();

        $sectors = $this->browserRequest('GET', '/api/reports/dual-program')->assertOk()->json('data.by_sector');
        expect(end($sectors))->toMatchArray(['sector_code' => null, 'active_companies' => 1])
            ->and(array_sum(array_column($sectors, 'active_companies')))->toBe(2);
        expect($this->browserRequest('GET', '/api/reports/dual-program/export.csv')->assertOk()->streamedContent())->toContain('Sin sector asignado');
        $this->browserRequest('GET', '/api/dashboard')->assertOk();
    });

    it('names the unnamed company in the audit log', function () {
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
        $events = collect($this->browserRequest('GET', '/api/audit-events')->assertOk()->json('data'));
        expect($events->firstWhere('type', 'company_registered')['resource'])->toBe(['id' => $this->invited->id, 'name' => 'Empresa sin nombre']);
    });
});

describe('lado de la institución, si la empresa vacía su perfil después de vincular', function () {
    it('keeps the inbox, the detail, the CSV and the conversation working', function () {
        $linkage = invitedLinkage($this->institution);
        $account = User::factory()->forInstitution($this->institution)->create();
        $this->loginWithCookies($account)->assertOk();

        expect($this->browserRequest('GET', '/api/institution/linkage-requests')->assertOk()->json('data.0.company.name'))->toBe('Empresa sin nombre');
        $this->browserRequest('GET', "/api/institution/linkage-requests/{$linkage->id}")->assertOk()
            ->assertJsonPath('data.company.legal_name', null)->assertJsonPath('data.company.contact_email', null)->assertJsonPath('data.company.sector_code', '54');
        expect($this->browserRequest('GET', '/api/institution/linkage-requests/export.csv')->assertOk()->streamedContent())->toContain('Empresa sin nombre');
        $this->browserRequest('GET', "/api/institution/linkage-requests/{$linkage->id}/messages")->assertOk();
    });

    it('emails the message notice with the fallback name', function () {
        Notification::fake();
        $linkage = invitedLinkage($this->institution);
        $recipient = User::factory()->forInstitution($this->institution)->create();
        $message = new LinkageMessage(['body' => 'Hola']);
        $message->linkage_request_id = $linkage->id;
        $message->sender_party = 'COMPANY';
        $message->sender_user_id = $linkage->requested_by;
        $message->save();

        (new NotifyLinkageMessage($linkage->id, LinkageParty::INSTITUTION, $message->id))->handle();
        Notification::assertSentTo($recipient, LinkageMessageReceived::class, fn (LinkageMessageReceived $notice) => $notice->senderName === 'Empresa sin nombre');
    });
});
