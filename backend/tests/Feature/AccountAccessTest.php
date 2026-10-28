<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

// HU-S6-04: inactivación y restablecimiento de contraseña para cuentas SECRETARY y COMPANY.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

const ACCESS_NEW_PASSWORD = 'ContrasenaNueva789!';

beforeEach(function () {
    Notification::fake();
    $this->initializeCookieBrowser();
    $this->secretary = User::factory()->role(UserRole::SECRETARY)->create(['name' => 'Analista de vinculación']);
    $this->company = Company::factory()->create();
    $this->companyAccount = User::factory()->forCompany($this->company)->create(['name' => 'Reclutadora']);
});

function accessUser(UserRole $role, array $attributes = [], bool $pending = false): User
{
    return tap(User::factory()->role($role)->create($attributes), fn (User $user) => $user->forceFill(['password_setup_required' => $pending])->save());
}

function signInAccessManager($test, UserRole $role): User
{
    $user = accessUser($role);
    $test->loginWithCookies($user)->assertOk();

    return $user;
}

function secretaryStatus($test, User|int $account, array $body)
{
    return $test->browserRequest('PATCH', '/api/secretary-accounts/'.($account instanceof User ? $account->id : $account).'/status', $body);
}

function companyAccountStatus($test, Company $company, User|int $account, array $body)
{
    return $test->browserRequest('PATCH', "/api/companies/{$company->id}/accounts/".($account instanceof User ? $account->id : $account).'/status', $body);
}

/** Token del último correo de restablecimiento enviado a la cuenta. */
function sentResetToken(User $account): string
{
    $url = null;
    Notification::assertSentTo($account, ResetInstitutionPassword::class, function (ResetInstitutionPassword $notification) use (&$url) {
        $url = $notification->resetUrl;

        return true;
    });
    parse_str(parse_url($url, PHP_URL_QUERY), $query);

    return $query['token'];
}

/** La persona titular abre el enlace en un navegador sin sesión. */
function holderResets($test, User $account, string $token)
{
    $test->replaceBrowserCookies([]);
    $test->startCookieSession();

    return $test->browserRequest('POST', '/api/institution-accounts/password-reset', [
        'email' => $account->email, 'token' => $token, 'password' => ACCESS_NEW_PASSWORD, 'password_confirmation' => ACCESS_NEW_PASSWORD,
    ]);
}

describe('estado de cuentas SECRETARY (CA-01)', function () {
    it('lets ADMIN and SECRETARY deactivate and reactivate a configured SECRETARY account', function (UserRole $role) {
        signInAccessManager($this, $role);

        secretaryStatus($this, $this->secretary, ['is_active' => false])->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => [
                'id' => $this->secretary->id, 'name' => 'Analista de vinculación', 'email' => $this->secretary->email,
                'status' => 'inactive', 'created_at' => $this->secretary->created_at->toISOString(),
            ]]);
        expect($this->secretary->refresh()->is_active)->toBeFalse();

        secretaryStatus($this, $this->secretary, ['is_active' => true])->assertOk()->assertJsonPath('data.status', 'active');
        expect($this->secretary->refresh()->is_active)->toBeTrue();
    })->with([UserRole::ADMIN, UserRole::SECRETARY]);

    it('signs out the deactivated account on its next request and rejects its login', function () {
        $this->loginWithCookies($this->secretary)->assertOk();
        $secretaryCookies = $this->currentBrowserCookies();
        $this->replaceBrowserCookies([]);
        signInAccessManager($this, UserRole::ADMIN);
        secretaryStatus($this, $this->secretary, ['is_active' => false])->assertOk();

        $this->replaceBrowserCookies($secretaryCookies);
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();
        $this->replaceBrowserCookies([]);
        expect($this->loginWithCookies($this->secretary)->status())->not->toBe(200);
    });

    it('does not let a SECRETARY deactivate their own account', function () {
        $this->loginWithCookies($this->secretary)->assertOk();

        secretaryStatus($this, $this->secretary, ['is_active' => false])->assertUnprocessable()
            ->assertJsonValidationErrors(['is_active' => 'No puedes inactivar tu propia cuenta.']);
        expect($this->secretary->refresh()->is_active)->toBeTrue();
    });

    it('refers accounts pending initial setup to the setup link', function () {
        $pending = accessUser(UserRole::SECRETARY, pending: true);
        signInAccessManager($this, UserRole::ADMIN);

        secretaryStatus($this, $pending, ['is_active' => false])->assertUnprocessable()
            ->assertJsonValidationErrors(['is_active' => 'La cuenta aún no ha establecido su contraseña inicial.']);
        expect($pending->refresh()->is_active)->toBeTrue();
    });

    it('answers 404 for accounts of other roles exactly like a missing one', function () {
        signInAccessManager($this, UserRole::SECRETARY);
        $admin = accessUser(UserRole::ADMIN);
        $institutionAccount = User::factory()->forInstitution(Institution::factory()->create())->create();

        foreach ([$admin, $institutionAccount, $this->companyAccount, 999999] as $target) {
            secretaryStatus($this, $target, ['is_active' => false])->assertNotFound()->assertExactJson(['message' => 'La cuenta no existe.']);
        }
        expect([$admin->refresh()->is_active, $institutionAccount->refresh()->is_active, $this->companyAccount->refresh()->is_active])->toBe([true, true, true]);
    });

    it('validates the body strictly', function (array $body, string $field) {
        signInAccessManager($this, UserRole::ADMIN);

        secretaryStatus($this, $this->secretary, $body)->assertUnprocessable()->assertJsonValidationErrors([$field]);
        expect($this->secretary->refresh()->is_active)->toBeTrue();
    })->with([
        'sin estado' => [[], 'is_active'],
        'texto' => [['is_active' => 'false'], 'is_active'],
        'número' => [['is_active' => 0], 'is_active'],
        'campo extra' => [['is_active' => false, 'role' => 'ADMIN'], 'role'],
    ]);

    it('forbids INSTITUTION and COMPANY, rejects visitors and requires CSRF', function () {
        $this->startCookieSession();
        secretaryStatus($this, $this->secretary, ['is_active' => false])->assertUnauthorized();

        foreach ([User::factory()->forInstitution(Institution::factory()->create())->create(), $this->companyAccount] as $user) {
            $this->replaceBrowserCookies([]);
            $this->loginWithCookies($user)->assertOk();
            secretaryStatus($this, $this->secretary, ['is_active' => false])->assertForbidden();
        }

        $this->replaceBrowserCookies([]);
        signInAccessManager($this, UserRole::ADMIN);
        $this->browserRequest('PATCH', "/api/secretary-accounts/{$this->secretary->id}/status", ['is_active' => false], csrf: false)->assertStatus(419);
        expect($this->secretary->refresh()->is_active)->toBeTrue();
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        signInAccessManager($this, UserRole::ADMIN);
        $this->browserRequest('PATCH', "/api/secretary-accounts/{$id}/status", ['is_active' => false])->assertNotFound();
    })->with(['0', 'abc', '1234567890123456789']);
});

describe('restablecimiento de cuentas SECRETARY (CA-02)', function () {
    it('lets ADMIN and SECRETARY mail a one-time link that the holder uses at /reset-password', function (UserRole $role) {
        signInAccessManager($this, $role);

        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => '  '.strtoupper($this->secretary->email).' '])
            ->assertOk()->assertExactJson(['reset_delivery' => 'sent'])->assertHeader('Cache-Control', 'no-store, private');
        Notification::assertSentTo($this->secretary, ResetInstitutionPassword::class,
            fn (ResetInstitutionPassword $notification) => $notification->initiator === ResetInstitutionPassword::SECRETARY_INITIATOR
                && str_contains($notification->toMail($this->secretary)->render(), 'La Secretaría de Economía inició'));
        $token = sentResetToken($this->secretary);

        holderResets($this, $this->secretary, $token)->assertNoContent();
        $this->loginWithCookies($this->secretary, ['password' => ACCESS_NEW_PASSWORD])->assertOk();
        // Un solo uso.
        holderResets($this, $this->secretary, $token)->assertUnprocessable()->assertJsonValidationErrors(['token']);
    })->with([UserRole::ADMIN, UserRole::SECRETARY]);

    it('closes the open sessions of the account when the password changes', function () {
        $this->loginWithCookies($this->secretary)->assertOk();
        $session = $this->currentBrowserCookies();
        $this->replaceBrowserCookies([]);
        signInAccessManager($this, UserRole::ADMIN);
        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email])->assertOk();

        holderResets($this, $this->secretary, sentResetToken($this->secretary))->assertNoContent();
        $this->replaceBrowserCookies($session);
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();
    });

    it('only resets active, configured SECRETARY accounts', function (Closure $target, string $message) {
        signInAccessManager($this, UserRole::ADMIN);
        $email = $target->call($this);

        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $email])->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => $message]);
        Notification::assertNothingSent();
    })->with([
        'desconocida' => [fn () => 'nadie@example.test', 'No hay una cuenta de la Secretaría con ese correo.'],
        'empresa' => [fn () => $this->companyAccount->email, 'No hay una cuenta de la Secretaría con ese correo.'],
        'admin' => [fn () => accessUser(UserRole::ADMIN)->email, 'No hay una cuenta de la Secretaría con ese correo.'],
        'inactiva' => [fn () => accessUser(UserRole::SECRETARY, ['is_active' => false])->email, 'La cuenta está inactiva'],
        'pendiente' => [fn () => accessUser(UserRole::SECRETARY, pending: true)->email, 'La cuenta aún no ha establecido su contraseña inicial.'],
    ]);

    it('rejects a password chosen by the manager and enforces one minute between links', function () {
        signInAccessManager($this, UserRole::SECRETARY);

        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email, 'password' => 'Elegida123456!'])
            ->assertUnprocessable()->assertJsonValidationErrors(['password' => 'No puedes establecer la contraseña de otra cuenta.']);
        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email])->assertOk();
        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email])->assertStatus(429);
        $this->travel(61)->seconds();
        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email])->assertOk();
    });

    it('blocks the link of an account deactivated after it was sent', function () {
        signInAccessManager($this, UserRole::ADMIN);
        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email])->assertOk();
        $this->secretary->forceFill(['is_active' => false])->save();

        holderResets($this, $this->secretary, sentResetToken($this->secretary))->assertForbidden()->assertJsonPath('code', 'ACCOUNT_INACTIVE');
    });

    it('forbids INSTITUTION and COMPANY', function () {
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $this->browserRequest('POST', '/api/secretary-accounts/password-reset/start', ['email' => $this->secretary->email])->assertForbidden();
        Notification::assertNothingSent();
    });
});

describe('estado y restablecimiento de cuentas COMPANY (CA-03)', function () {
    it('lets SECRETARY deactivate and reactivate an account of the company', function () {
        signInAccessManager($this, UserRole::SECRETARY);
        $this->loginWithCookies($this->companyAccount)->assertOk();
        $companyCookies = $this->currentBrowserCookies();
        $this->replaceBrowserCookies([]);
        signInAccessManager($this, UserRole::SECRETARY);

        companyAccountStatus($this, $this->company, $this->companyAccount, ['is_active' => false])->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->replaceBrowserCookies($companyCookies);
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();

        $this->replaceBrowserCookies([]);
        signInAccessManager($this, UserRole::SECRETARY);
        companyAccountStatus($this, $this->company, $this->companyAccount, ['is_active' => true])->assertOk()->assertJsonPath('data.status', 'active');
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->companyAccount)->assertOk();
    });

    it('answers 404 for an account of another company, another role or a missing company', function () {
        signInAccessManager($this, UserRole::SECRETARY);
        $foreign = User::factory()->forCompany(Company::factory()->create())->create();

        foreach ([$foreign, $this->secretary, 999999] as $target) {
            companyAccountStatus($this, $this->company, $target, ['is_active' => false])->assertNotFound()->assertExactJson(['message' => 'La cuenta no existe.']);
        }
        $this->browserRequest('PATCH', "/api/companies/999999/accounts/{$this->companyAccount->id}/status", ['is_active' => false])->assertNotFound();
        $this->browserRequest('POST', "/api/companies/{$this->company->id}/accounts/password-reset/start", ['email' => $foreign->email])
            ->assertNotFound()->assertExactJson(['message' => 'La cuenta no existe.']);
        expect([$foreign->refresh()->is_active, $this->secretary->refresh()->is_active])->toBe([true, true]);
        Notification::assertNothingSent();
    });

    it('requires an active company', function () {
        signInAccessManager($this, UserRole::SECRETARY);
        $this->company->forceFill(['is_active' => false])->save();

        companyAccountStatus($this, $this->company, $this->companyAccount, ['is_active' => false])->assertUnprocessable()
            ->assertJsonValidationErrors(['company' => 'La empresa está inactiva']);
        $this->browserRequest('POST', "/api/companies/{$this->company->id}/accounts/password-reset/start", ['email' => $this->companyAccount->email])
            ->assertUnprocessable()->assertJsonValidationErrors(['company' => 'La empresa está inactiva']);
        expect($this->companyAccount->refresh()->is_active)->toBeTrue();
        Notification::assertNothingSent();
    });

    it('refers pending accounts to the setup link', function () {
        signInAccessManager($this, UserRole::SECRETARY);
        $pending = tap(User::factory()->forCompany($this->company)->create(), fn (User $user) => $user->forceFill(['password_setup_required' => true])->save());

        companyAccountStatus($this, $this->company, $pending, ['is_active' => false])->assertUnprocessable()
            ->assertJsonValidationErrors(['is_active' => 'La cuenta aún no ha establecido su contraseña inicial.']);
        $this->browserRequest('POST', "/api/companies/{$this->company->id}/accounts/password-reset/start", ['email' => $pending->email])
            ->assertUnprocessable()->assertJsonValidationErrors(['email' => 'La cuenta aún no ha establecido su contraseña inicial.']);
    });

    it('mails a reset link for an account of the company that the holder uses at /reset-password', function () {
        signInAccessManager($this, UserRole::SECRETARY);

        $this->browserRequest('POST', "/api/companies/{$this->company->id}/accounts/password-reset/start", ['email' => $this->companyAccount->email])
            ->assertOk()->assertExactJson(['reset_delivery' => 'sent']);
        holderResets($this, $this->companyAccount, sentResetToken($this->companyAccount))->assertNoContent();
        $this->loginWithCookies($this->companyAccount, ['password' => ACCESS_NEW_PASSWORD])->assertOk();
    });

    it('blocks the link while the company is inactive without spending it', function () {
        signInAccessManager($this, UserRole::SECRETARY);
        $this->browserRequest('POST', "/api/companies/{$this->company->id}/accounts/password-reset/start", ['email' => $this->companyAccount->email])->assertOk();
        $token = sentResetToken($this->companyAccount);
        $this->company->forceFill(['is_active' => false])->save();

        holderResets($this, $this->companyAccount, $token)->assertForbidden()->assertJsonPath('code', 'COMPANY_INACTIVE');
        expect(Password::broker('institution_reset')->tokenExists($this->companyAccount, $token))->toBeTrue();
    });

    it('forbids ADMIN, INSTITUTION and COMPANY', function (Closure $user) {
        $this->loginWithCookies($user->call($this))->assertOk();

        companyAccountStatus($this, $this->company, $this->companyAccount, ['is_active' => false])->assertForbidden();
        $this->browserRequest('POST', "/api/companies/{$this->company->id}/accounts/password-reset/start", ['email' => $this->companyAccount->email])->assertForbidden();
        expect($this->companyAccount->refresh()->is_active)->toBeTrue();
    })->with([
        'admin' => [fn () => accessUser(UserRole::ADMIN)],
        'institución' => [fn () => User::factory()->forInstitution(Institution::factory()->create())->create()],
        'empresa' => [fn () => User::factory()->forCompany($this->company)->create()],
    ]);
});
