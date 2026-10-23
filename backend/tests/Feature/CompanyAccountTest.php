<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// HU-S4-03: cuentas de acceso de empresa.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->secretary = User::factory()->role(UserRole::SECRETARY)->create();
    $this->company = Company::factory()->create(['legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'trade_name' => 'ManuGolfo']);
});

function companyAccountsUrl(Company $company, string $suffix = ''): string
{
    return '/api/companies/'.$company->id.'/accounts'.$suffix;
}

function companyAccountPayload(array $overrides = []): array
{
    return array_replace(['name' => 'Responsable de talento', 'email' => 'talento@manugolfo.test'], $overrides);
}

/** La Secretaría crea una cuenta por correo y devuelve la cuenta y los datos del enlace enviado. */
function createCompanyAccount($test, Company $company): array
{
    $id = $test->browserRequest('POST', companyAccountsUrl($company), companyAccountPayload())->assertCreated()->json('data.id');
    $account = User::findOrFail($id);

    return [$account, sentSetupLinkQuery($account)];
}

function setCompanyPassword($test, array $query, string $password = 'CompanyPassword123!')
{
    return $test->browserRequest('POST', '/api/institution-accounts/password-setup', [
        'email' => $query['email'], 'token' => $query['token'], 'password' => $password, 'password_confirmation' => $password,
    ]);
}

it('creates a pending COMPANY account linked to the company of the route (CA-01, CA-02)', function () {
    Notification::fake();
    $this->loginWithCookies($this->secretary)->assertOk();

    $response = $this->browserRequest('POST', companyAccountsUrl($this->company), companyAccountPayload(['email' => ' Talento@ManuGolfo.test ']))
        ->assertCreated()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('setup_delivery', 'sent')
        ->assertJsonMissingPath('setup_url')
        ->assertJsonPath('data.email', 'talento@manugolfo.test')
        ->assertJsonPath('data.status', 'pending');

    $account = User::findOrFail($response->json('data.id'));
    expect($account->role)->toBe(UserRole::COMPANY)
        ->and($account->company_id)->toBe($this->company->id)
        ->and($account->institution_id)->toBeNull()
        ->and($account->password_setup_required)->toBeTrue()
        ->and($account->created_by)->toBe($this->secretary->id);
    Notification::assertSentTo($account, SetInitialPassword::class);
});

it('ignores fields that try to choose another role, company or institution (CA-01)', function () {
    Notification::fake();
    $other = Company::factory()->create();
    $this->loginWithCookies($this->secretary)->assertOk();

    $id = $this->browserRequest('POST', companyAccountsUrl($this->company), companyAccountPayload([
        'role' => 'ADMIN', 'company_id' => $other->id, 'institution_id' => Institution::factory()->create()->id,
        'created_by' => $other->registered_by, 'password' => 'Password123!',
    ]))->assertCreated()->json('data.id');

    $account = User::findOrFail($id);
    expect($account->role)->toBe(UserRole::COMPANY)
        ->and($account->company_id)->toBe($this->company->id)
        ->and($account->institution_id)->toBeNull()
        ->and($account->created_by)->toBe($this->secretary->id)
        ->and(Hash::check('Password123!', $account->password))->toBeFalse();
});

it('returns a manual link and audits who generated it (CA-02)', function () {
    Notification::fake();
    Log::spy();
    $this->loginWithCookies($this->secretary)->assertOk();

    $response = $this->browserRequest('POST', companyAccountsUrl($this->company), companyAccountPayload(['delivery_method' => 'manual']))
        ->assertCreated()->assertJsonPath('setup_delivery', 'manual');

    expect(str_contains($response->json('setup_url'), '/set-initial-password?'))->toBeTrue();
    Notification::assertNothingSent();
    Log::shouldHaveReceived('notice')->once()->withArgs(fn (string $message, array $context): bool => $context === ['issued_by' => $this->secretary->id, 'user_id' => $response->json('data.id')]);
});

it('does not create accounts for an inactive or missing company (CA-01)', function () {
    $this->company->forceFill(['is_active' => false])->save();
    $this->loginWithCookies($this->secretary)->assertOk();

    $this->browserRequest('POST', companyAccountsUrl($this->company), companyAccountPayload())
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['company' => 'La empresa está inactiva: actívala para crear cuentas.']);
    $this->browserRequest('POST', '/api/companies/999999/accounts', companyAccountPayload())->assertNotFound();
    $this->browserRequest('POST', '/api/companies/abc/accounts', companyAccountPayload())->assertNotFound();

    expect(User::where('role', UserRole::COMPANY)->exists())->toBeFalse();
});

it('validates the account data and rejects a duplicated email', function (array $overrides, string $field) {
    User::factory()->role(UserRole::SECRETARY)->create(['email' => 'ocupado@economia.test']);
    $this->loginWithCookies($this->secretary)->assertOk();

    $this->browserRequest('POST', companyAccountsUrl($this->company), companyAccountPayload($overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(User::where('role', UserRole::COMPANY)->exists())->toBeFalse();
})->with([
    'missing name' => [['name' => null], 'name'],
    'missing email' => [['email' => null], 'email'],
    'invalid email' => [['email' => 'no-es-correo'], 'email'],
    'duplicated email' => [['email' => 'OCUPADO@economia.test'], 'email'],
    'unknown delivery' => [['delivery_method' => 'fax'], 'delivery_method'],
]);

it('lets the holder set the password, sign in and see the company name without internal data (CA-02, CA-05)', function () {
    Notification::fake();
    $this->loginWithCookies($this->secretary)->assertOk();
    [$account, $query] = createCompanyAccount($this, $this->company);
    $this->browserRequest('POST', '/api/logout')->assertNoContent();

    $this->startCookieSession();
    setCompanyPassword($this, $query)->assertNoContent();

    $this->loginWithCookies($account, ['password' => 'CompanyPassword123!'])->assertOk()
        ->assertJsonPath('user.role', 'COMPANY')
        ->assertJsonPath('user.institution', null)
        ->assertJsonPath('user.company', ['id' => $this->company->id, 'name' => 'ManuGolfo']);
    $me = $this->browserRequest('GET', '/api/me')->assertOk();
    expect(array_keys($me->json('user.company')))->toBe(['id', 'name']);
    expect($me->getContent())->not->toContain($this->company->rfc);
});

it('shows the legal name when the company has no trade name (CA-05)', function () {
    $company = Company::factory()->create(['legal_name' => 'Servicios Integrales, S.C.', 'trade_name' => null]);
    $account = User::factory()->forCompany($company)->create();

    $this->loginWithCookies($account)->assertOk()->assertJsonPath('user.company.name', 'Servicios Integrales, S.C.');
});

it('rejects the login of an inactive company and restores it on reactivation (CA-04)', function () {
    $account = User::factory()->forCompany($this->company)->create();
    $this->company->forceFill(['is_active' => false])->save();
    $this->startCookieSession();

    $this->browserRequest('POST', '/api/login', ['email' => $account->email, 'password' => 'Password123!'])
        ->assertUnauthorized()
        ->assertJsonPath('code', 'COMPANY_INACTIVE')
        ->assertJsonPath('message', 'La empresa está inactiva. No puedes acceder al sistema.');
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();

    $this->company->forceFill(['is_active' => true])->save();
    $this->loginWithCookies($account)->assertOk();
});

it('does not disclose the inactive company with wrong credentials (CA-04)', function () {
    $account = User::factory()->forCompany($this->company)->create();
    $this->company->forceFill(['is_active' => false])->save();
    $this->startCookieSession();

    $this->browserRequest('POST', '/api/login', ['email' => $account->email, 'password' => 'incorrecta-123'])
        ->assertUnprocessable()->assertJsonMissingPath('code');
});

it('closes an open session on its next request when the Secretary inactivates the company (CA-04)', function () {
    $account = User::factory()->forCompany($this->company)->create();
    $this->loginWithCookies($account)->assertOk();
    $oldCookies = $this->currentBrowserCookies();
    $oldId = $this->currentSessionId();

    $this->company->forceFill(['is_active' => false])->save();

    $this->browserRequest('GET', '/api/me')->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
    expect($this->sessionExists($oldId))->toBeFalse();
    $this->company->forceFill(['is_active' => true])->save();
    $this->replaceBrowserCookies($oldCookies);
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
});

it('blocks the login after inactivation through the Secretary endpoint (HU-S4-02 CA-07)', function () {
    $account = User::factory()->forCompany($this->company)->create();
    $this->loginWithCookies($this->secretary)->assertOk();
    $this->browserRequest('PATCH', '/api/companies/'.$this->company->id.'/status', ['is_active' => false])->assertOk();
    $this->browserRequest('POST', '/api/logout')->assertNoContent();

    $this->startCookieSession();
    $this->browserRequest('POST', '/api/login', ['email' => $account->email, 'password' => 'Password123!'])
        ->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
});

it('keeps the setup token while the company is inactive (CA-04)', function () {
    Notification::fake();
    $this->loginWithCookies($this->secretary)->assertOk();
    [$account, $query] = createCompanyAccount($this, $this->company);
    $this->browserRequest('POST', '/api/logout')->assertNoContent();
    $this->company->forceFill(['is_active' => false])->save();

    $this->startCookieSession();
    setCompanyPassword($this, $query)->assertForbidden()->assertJsonPath('code', 'COMPANY_INACTIVE');
    expect($account->fresh()->password_setup_required)->toBeTrue();

    $this->company->forceFill(['is_active' => true])->save();
    setCompanyPassword($this, $query)->assertNoContent();
});

it('lists only the accounts of the company with their status (CA-06)', function () {
    User::factory()->forCompany($this->company)->create(['name' => 'Beatriz', 'password_setup_required' => true]);
    User::factory()->forCompany($this->company)->create(['name' => 'Ana']);
    User::factory()->forCompany($this->company)->create(['name' => 'Carlos', 'is_active' => false]);
    User::factory()->forCompany(Company::factory()->create())->create(['name' => 'De otra empresa']);
    $this->loginWithCookies($this->secretary)->assertOk();

    $data = $this->browserRequest('GET', companyAccountsUrl($this->company))
        ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data');

    expect(array_map(fn (array $row) => [$row['name'], $row['status']], $data))
        ->toBe([['Ana', 'active'], ['Beatriz', 'pending'], ['Carlos', 'inactive']]);
    expect(array_keys($data[0]))->toBe(['id', 'name', 'email', 'status', 'created_at']);
});

it('resends the link of a pending account of the company and invalidates the previous one (CA-02)', function () {
    Notification::fake();
    $this->loginWithCookies($this->secretary)->assertOk();
    [, $first] = createCompanyAccount($this, $this->company);
    $this->travel(61)->seconds();

    $this->browserRequest('POST', companyAccountsUrl($this->company, '/resend-setup'), ['email' => 'talento@manugolfo.test', 'delivery_method' => 'manual'])
        ->assertOk()->assertJsonPath('setup_delivery', 'manual');

    $this->browserRequest('POST', '/api/logout')->assertNoContent();
    $this->startCookieSession();
    setCompanyPassword($this, $first)->assertUnprocessable()->assertJsonValidationErrors('token');
});

it('waits a minute between two resends of the same account', function () {
    Notification::fake();
    $this->loginWithCookies($this->secretary)->assertOk();
    createCompanyAccount($this, $this->company);

    $this->browserRequest('POST', companyAccountsUrl($this->company, '/resend-setup'), ['email' => 'talento@manugolfo.test'])->assertStatus(429);
});

it('only resends links of pending accounts of this active company', function (Closure $make) {
    $this->loginWithCookies($this->secretary)->assertOk();
    $account = $make($this->company);

    $this->browserRequest('POST', companyAccountsUrl($this->company, '/resend-setup'), ['email' => $account->email])
        ->assertUnprocessable();
    expect(DB::table('institution_password_setup_tokens')->where('email', $account->email)->exists())->toBeFalse();
})->with([
    'already configured' => [fn (Company $company) => User::factory()->forCompany($company)->create()],
    'inactive account' => [fn (Company $company) => User::factory()->forCompany($company)->create(['is_active' => false, 'password_setup_required' => true])],
    'account of another company' => [fn () => User::factory()->forCompany(Company::factory()->create())->create(['password_setup_required' => true])],
    'secretary account' => [fn () => User::factory()->role(UserRole::SECRETARY)->create(['password_setup_required' => true])],
    'inactive company' => [function (Company $company) {
        $account = User::factory()->forCompany($company)->create(['password_setup_required' => true]);
        $company->forceFill(['is_active' => false])->save();

        return $account;
    }],
]);

it('enforces the role and organization coherence in the database (CA-03)', function (Closure $values) {
    $user = User::factory()->role(UserRole::SECRETARY)->create();

    expect(fn () => DB::table('users')->where('id', $user->id)->update(value($values, $this->company)))->toThrow(QueryException::class);
})->with([
    'company without company' => [fn () => ['role' => 'COMPANY']],
    'company with an institution' => [fn (Company $company) => ['role' => 'COMPANY', 'company_id' => $company->id, 'institution_id' => Institution::factory()->create()->id]],
    'institution with a company' => [fn (Company $company) => ['role' => 'INSTITUTION', 'company_id' => $company->id]],
    'secretary with a company' => [fn (Company $company) => ['company_id' => $company->id]],
    'admin with an institution' => [fn () => ['role' => 'ADMIN', 'institution_id' => Institution::factory()->create()->id]],
]);

it('only lets SECRETARY manage company accounts', function (UserRole $role) {
    $user = $role === UserRole::INSTITUTION
        ? User::factory()->forInstitution(Institution::factory()->create())->create()
        : User::factory()->role($role)->create();
    $this->loginWithCookies($user)->assertOk();

    $this->browserRequest('GET', companyAccountsUrl($this->company))->assertForbidden();
    $this->browserRequest('POST', companyAccountsUrl($this->company), companyAccountPayload())->assertForbidden();
    $this->browserRequest('POST', companyAccountsUrl($this->company, '/resend-setup'), ['email' => 'x@y.test'])->assertForbidden();
    expect(User::where('email', 'talento@manugolfo.test')->exists())->toBeFalse();
})->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::COMPANY]);
