<?php

use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// HU-S14-04: ediciones de ADMIN y SECRETARY en la bitácora inmutable (D8) y los eventos de account_audit_events en
// /audit-events, solo con nombres de campos: nunca valores, correos de contacto, teléfonos, RFC ni contraseñas.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    Notification::fake();
    $this->admin = User::factory()->role(UserRole::ADMIN)->create(['name' => 'Administración General']);
    $this->secretary = User::factory()->role(UserRole::SECRETARY)->create(['name' => 'Analista SE']);
});

function auditLogEvents($test, string $query = ''): array
{
    $test->loginWithCookies($test->admin)->assertOk();

    return $test->browserRequest('GET', '/api/audit-events'.$query)->assertOk()->json('data');
}

describe('ediciones de ADMIN y SECRETARY (D8)', function () {
    it('records the fields the secretary really changed in a company, and nothing without changes', function () {
        $company = Company::factory()->create(['trade_name' => 'ManuGolfo', 'contact_phone' => null]);
        $this->loginWithCookies($this->secretary)->assertOk();
        $detail = $this->browserRequest('GET', "/api/companies/{$company->id}")->assertOk()->json('data');
        $payload = collect($detail)->only(['legal_name', 'trade_name', 'rfc', 'sector_code', 'state_code', 'municipality_code',
            'contact_name', 'contact_position', 'contact_email', 'contact_phone', 'validation_reference'])->all();

        $this->browserRequest('PUT', "/api/companies/{$company->id}", $payload)->assertOk();
        expect(AccountAuditEvent::query()->count())->toBe(0);

        $this->browserRequest('PUT', "/api/companies/{$company->id}", [...$payload, 'trade_name' => 'Golfo Industrial', 'contact_phone' => '8331234567', 'municipality_code' => '28032'])->assertOk();
        $event = AccountAuditEvent::query()->sole();
        expect([$event->event, $event->subject_type, $event->subject_id, $event->actor_id])
            ->toBe(['organization_profile_updated', 'company', $company->id, $this->secretary->id])
            ->and($event->changed_fields)->toEqualCanonicalizing(['trade_name', 'municipality_code', 'contact_phone']);
    });

    it('records the fields the administration really changed in an institution, and nothing without changes', function () {
        $institution = Institution::factory()->create(['name' => 'Instituto Dual', 'cct' => '09DIT0001A', 'contact_name' => 'María López', 'contact_email' => 'contacto@example.test']);
        $this->loginWithCookies($this->admin)->assertOk();
        $payload = ['name' => 'Instituto Dual', 'cct' => '09DIT0001A', 'contact_name' => 'María López', 'contact_email' => 'contacto@example.test'];

        $this->browserRequest('PUT', "/api/institutions/{$institution->id}", $payload)->assertOk();
        expect(AccountAuditEvent::query()->count())->toBe(0);

        $this->browserRequest('PUT', "/api/institutions/{$institution->id}", [...$payload, 'name' => 'Instituto Dual del Golfo', 'contact_email' => 'nuevo@example.test'])->assertOk();
        $event = AccountAuditEvent::query()->sole();
        expect([$event->event, $event->subject_type, $event->subject_id, $event->actor_id])
            ->toBe(['organization_profile_updated', 'institution', $institution->id, $this->admin->id])
            ->and($event->changed_fields)->toEqualCanonicalizing(['name', 'contact_email']);
    });
});

describe('eventos de cuentas y organizaciones en la bitácora', function () {
    it('lists the four new events with actor, subject, field names and time, newest first', function () {
        $company = Company::factory()->create(['trade_name' => 'ManuGolfo']);
        $institution = Institution::factory()->create(['name' => 'UT del Golfo']);
        $operator = User::factory()->forCompany($company)->create(['name' => 'Lucía Herrera']);
        $this->travelTo('2026-11-19 10:00:00');
        AccountAuditEvent::record($this->secretary, AccountAuditEvent::COMPANY_INVITED, $company);
        $this->travelTo('2026-11-19 10:01:00');
        AccountAuditEvent::record($operator, AccountAuditEvent::ACCOUNT_UPDATED, $operator, ['name']);
        $this->travelTo('2026-11-19 10:02:00');
        AccountAuditEvent::record($operator, AccountAuditEvent::PASSWORD_CHANGED, $operator);
        $this->travelTo('2026-11-19 10:03:00');
        AccountAuditEvent::record($operator, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $company, ['trade_name', 'sector_code']);
        $this->travelTo('2026-11-19 10:04:00');
        AccountAuditEvent::record($this->admin, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $institution, ['contact_email']);
        $this->travelBack();

        $new = ['account_updated', 'password_changed', 'organization_profile_updated', 'company_invited'];
        $events = collect(auditLogEvents($this))->filter(fn (array $event) => in_array($event['type'], $new, true))->values()->all();
        expect($events)->toBe([
            ['type' => 'organization_profile_updated', 'occurred_at' => '2026-11-19T10:04:00.000000Z',
                'actor' => ['id' => $this->admin->id, 'name' => 'Administración General', 'role' => 'ADMIN'],
                'resource' => ['subject_type' => 'institution', 'id' => $institution->id, 'name' => 'UT del Golfo', 'fields' => ['contact_email']]],
            ['type' => 'organization_profile_updated', 'occurred_at' => '2026-11-19T10:03:00.000000Z',
                'actor' => ['id' => $operator->id, 'name' => 'Lucía Herrera', 'role' => 'COMPANY'],
                'resource' => ['subject_type' => 'company', 'id' => $company->id, 'name' => 'ManuGolfo', 'fields' => ['trade_name', 'sector_code']]],
            ['type' => 'password_changed', 'occurred_at' => '2026-11-19T10:02:00.000000Z',
                'actor' => ['id' => $operator->id, 'name' => 'Lucía Herrera', 'role' => 'COMPANY'],
                'resource' => ['subject_type' => 'user', 'id' => $operator->id, 'name' => 'Lucía Herrera', 'role' => 'COMPANY', 'fields' => []]],
            ['type' => 'account_updated', 'occurred_at' => '2026-11-19T10:01:00.000000Z',
                'actor' => ['id' => $operator->id, 'name' => 'Lucía Herrera', 'role' => 'COMPANY'],
                'resource' => ['subject_type' => 'user', 'id' => $operator->id, 'name' => 'Lucía Herrera', 'role' => 'COMPANY', 'fields' => ['name']]],
            ['type' => 'company_invited', 'occurred_at' => '2026-11-19T10:00:00.000000Z',
                'actor' => ['id' => $this->secretary->id, 'name' => 'Analista SE', 'role' => 'SECRETARY'],
                'resource' => ['subject_type' => 'company', 'id' => $company->id, 'name' => 'ManuGolfo', 'fields' => []]],
        ]);
    });

    it('filters by each new type', function (string $type, int $expected) {
        $company = Company::factory()->create();
        $operator = User::factory()->forCompany($company)->create();
        AccountAuditEvent::record($this->secretary, AccountAuditEvent::COMPANY_INVITED, $company);
        AccountAuditEvent::record($operator, AccountAuditEvent::ACCOUNT_UPDATED, $operator, ['name']);
        AccountAuditEvent::record($operator, AccountAuditEvent::PASSWORD_CHANGED, $operator);
        AccountAuditEvent::record($operator, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $company, ['rfc']);
        AccountAuditEvent::record($this->secretary, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $company, ['legal_name']);

        $events = auditLogEvents($this, '?type='.$type);
        expect($events)->toHaveCount($expected)->and(array_unique(array_column($events, 'type')))->toBe([$type]);
    })->with([
        ['account_updated', 1], ['password_changed', 1], ['organization_profile_updated', 2], ['company_invited', 1],
    ]);

    it('paginates the new events together with the existing ones, 30 per page', function () {
        $operator = User::factory()->forCompany(Company::factory()->create())->create();
        foreach (range(1, 31) as $attempt) {
            AccountAuditEvent::record($operator, AccountAuditEvent::PASSWORD_CHANGED, $operator);
        }
        $this->loginWithCookies($this->admin)->assertOk();
        $this->browserRequest('GET', '/api/audit-events?type=password_changed&page=2')->assertOk()
            ->assertJsonPath('meta.total', 31)->assertJsonPath('meta.last_page', 2)->assertJsonCount(1, 'data');
    });

    it('names an invited company without name with its fallback', function () {
        $invited = Company::factory()->invited()->create();
        AccountAuditEvent::record($this->secretary, AccountAuditEvent::COMPANY_INVITED, $invited);
        expect(auditLogEvents($this, '?type=company_invited')[0]['resource'])
            ->toBe(['subject_type' => 'company', 'id' => $invited->id, 'name' => 'Empresa sin nombre', 'fields' => []]);
    });

    it('never sends values, contact emails, phones, RFC nor passwords in the audit log', function () {
        $company = Company::factory()->create([
            'trade_name' => 'ManuGolfo', 'legal_name' => 'Manufacturas del Golfo, S.A.', 'rfc' => 'MGO150320AB1',
            'contact_name' => 'Contacto Secreto', 'contact_email' => 'contacto.secreto@manugolfo.test', 'contact_phone' => '8339876543',
            'validation_reference' => 'SE/FOLIO/0001',
        ]);
        $institution = Institution::factory()->create(['contact_email' => 'responsable.secreto@ut.test', 'contact_phone' => '8331112233']);
        $operator = User::factory()->forCompany($company)->create(['email' => 'operador.privado@manugolfo.test']);
        AccountAuditEvent::record($operator, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $company, ['rfc', 'contact_email', 'contact_phone', 'legal_name']);
        AccountAuditEvent::record($operator, AccountAuditEvent::PASSWORD_CHANGED, $operator);
        AccountAuditEvent::record($operator, AccountAuditEvent::ACCOUNT_UPDATED, $operator, ['name']);
        AccountAuditEvent::record($this->admin, AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $institution, ['contact_email', 'contact_phone']);

        $this->loginWithCookies($this->admin)->assertOk();
        foreach (['?type=organization_profile_updated', '?type=password_changed', '?type=account_updated'] as $query) {
            $json = $this->browserRequest('GET', '/api/audit-events'.$query)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->getContent();
            foreach (['MGO150320AB1', 'contacto.secreto', 'Contacto Secreto', '8339876543', 'responsable.secreto', '8331112233', 'SE/FOLIO',
                'Manufacturas del Golfo', 'operador.privado', 'Password123!', '$2y$'] as $secret) {
                expect($json)->not->toContain($secret);
            }
        }
    });
});
