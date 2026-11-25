<?php

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\AccessEmailChanged;
use App\Notifications\AccessEmailChangeRequested;
use App\Notifications\ConfirmAccessEmail;
use App\Notifications\SetInitialPassword;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionPasswordResetLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

// Sprint 19, PR 1: correo de acceso verificado (T-S19-01 a T-S19-04).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create(['contact_email' => 'coordinacion@escuela.test']);
    $this->account = User::factory()->forInstitution($this->institution)->create(['email' => 'coordinacion@escuela.test', 'name' => 'Coordinación Dual']);
});

const NEW_ACCESS_EMAIL = 'nuevo.correo@escuela.test';

/** Token del enlace de confirmación vigente: el enviado cuyo hash es el que guarda la cuenta. */
function sentEmailToken(?User $account = null): string
{
    $hash = ($account ?? User::query()->whereNotNull('email_token_hash')->sole())->fresh()->email_token_hash;
    foreach (Notification::sentNotifications() as $byKey) {
        foreach ($byKey as $byClass) {
            foreach ($byClass[ConfirmAccessEmail::class] ?? [] as $entry) {
                parse_str((string) parse_url($entry['notification']->url, PHP_URL_QUERY), $query);
                if (hash('sha256', $query['token']) === $hash) {
                    return $query['token'];
                }
            }
        }
    }
    throw new RuntimeException('No se envió el enlace vigente.');
}

function requestEmailChange($test, array $data = [])
{
    return $test->browserRequest('POST', '/api/me/email', array_replace(['email' => NEW_ACCESS_EMAIL, 'current_password' => 'Password123!'], $data));
}

describe('T-S19-01: estado de verificación', function () {
    it('verifies the email when an emailed setup link is completed, and not a manual one (D7)', function (string $delivery, bool $verified) {
        Notification::fake();
        $pending = User::factory()->forInstitution($this->institution)->create(['password_setup_required' => true]);
        $links = app(InitialPasswordLink::class);
        $url = $links->issue($pending);
        if ($delivery === 'email') {
            expect($links->deliverAfterCommit($pending, $url))->toBe('sent');
        }
        expect($pending->fresh()->setup_delivery->value)->toBe($delivery);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->startCookieSession();
        $this->browserRequest('POST', '/api/institution-accounts/password-setup', [
            'email' => $pending->email, 'token' => $query['token'], 'password' => 'Contraseña-Nueva-2026', 'password_confirmation' => 'Contraseña-Nueva-2026',
        ])->assertNoContent();

        expect($pending->fresh()->email_verified_at !== null)->toBe($verified);
    })->with([['email', true], ['manual', false]]);

    it('keeps the delivery as manual when the transport rejects the email', function () {
        $pending = User::factory()->forInstitution($this->institution)->create(['password_setup_required' => true]);
        config(['mail.default' => 'inexistente']);
        $links = app(InitialPasswordLink::class);

        expect($links->deliverAfterCommit($pending, $links->issue($pending)))->toBe('pending')
            ->and($pending->fresh()->setup_delivery)->toBe(SetupDeliveryMethod::MANUAL);
    });

    it('verifies the email when an emailed reset link is completed', function () {
        Notification::fake();
        $links = app(InstitutionPasswordResetLink::class);
        $url = $links->issue($this->account);
        $links->deliverAfterCommit($this->account, $url);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->startCookieSession();
        $this->browserRequest('POST', '/api/institution-accounts/password-reset', [
            'email' => $this->account->email, 'token' => $query['token'], 'password' => 'Contraseña-Nueva-2026', 'password_confirmation' => 'Contraseña-Nueva-2026',
        ])->assertNoContent();

        expect($this->account->fresh()->email_verified_at)->not->toBeNull();
    });

    it('starts unverified and exposes the state in /me without the token hash', function () {
        $this->loginWithCookies($this->account)->assertOk()
            ->assertJsonPath('user.email_verified', false)
            ->assertJsonPath('user.pending_email', null)
            ->assertJsonPath('user.email_link_sent_at', null)
            ->assertJsonMissingPath('user.email_token_hash');
    });
});

describe('T-S19-02: corregir el correo de una cuenta pendiente', function () {
    beforeEach(function () {
        $this->admin = User::factory()->role(UserRole::ADMIN)->create();
        $this->pending = User::factory()->forInstitution($this->institution)->create(['password_setup_required' => true, 'email' => 'coordinacoin@escuela.test', 'name' => 'Beto Pendiente']);
        $this->oldToken = Password::broker('institution_setup')->createToken($this->pending);
    });

    it('lists the institution accounts with their status and verification', function () {
        $this->loginWithCookies($this->admin)->assertOk();

        $this->browserRequest('GET', "/api/institutions/{$this->institution->id}/accounts")->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Beto Pendiente')->assertJsonPath('data.0.status', 'pending')->assertJsonPath('data.0.email_verified', false)
            ->assertJsonPath('data.1.status', 'active');
    });

    it('corrects the email, invalidates the old link and emails a new one to the right address', function () {
        Notification::fake();
        $this->loginWithCookies($this->admin)->assertOk();

        $this->browserRequest('PATCH', "/api/institutions/{$this->institution->id}/accounts/{$this->pending->id}/email", ['email' => ' Coordinacion.Beto@Escuela.test '])
            ->assertOk()
            ->assertJsonPath('data.email', 'coordinacion.beto@escuela.test')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('setup_delivery', 'sent')
            ->assertJsonMissingPath('setup_url');

        $pending = $this->pending->fresh();
        expect($pending->email)->toBe('coordinacion.beto@escuela.test')
            ->and($pending->setup_delivery)->toBe(SetupDeliveryMethod::EMAIL)
            ->and(Password::broker('institution_setup')->tokenExists($pending, $this->oldToken))->toBeFalse()
            ->and(DB::table('institution_password_setup_tokens')->where('email', 'coordinacoin@escuela.test')->exists())->toBeFalse();
        Notification::assertSentTo($pending, SetInitialPassword::class);
        Notification::assertSentTimes(SetInitialPassword::class, 1);
        $event = AccountAuditEvent::query()->where('event', 'email_changed')->sole();
        expect([$event->actor_id, $event->subject_id, $event->changed_fields])->toBe([$this->admin->id, $pending->id, ['email']]);
    });

    it('also corrects the provisional name of an invitation without a name (M3)', function () {
        Notification::fake();
        $this->pending->forceFill(['name' => 'coordinacoin@escuela.test'])->save();
        $this->loginWithCookies($this->admin)->assertOk();

        $this->browserRequest('PATCH', "/api/institutions/{$this->institution->id}/accounts/{$this->pending->id}/email", ['email' => 'coordinacion.beto@escuela.test'])
            ->assertOk()->assertJsonPath('data.name', 'coordinacion.beto@escuela.test');
        expect(AccountAuditEvent::query()->sole()->changed_fields)->toBe(['email', 'name']);
    });

    it('only corrects active pending accounts and rejects duplicates', function () {
        $this->loginWithCookies($this->admin)->assertOk();
        $uri = fn (User $account) => "/api/institutions/{$this->institution->id}/accounts/{$account->id}/email";

        $this->browserRequest('PATCH', $uri($this->account), ['email' => 'otro@escuela.test'])->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'Solo se corrige el correo de una cuenta activa pendiente de activar. Una cuenta activada cambia su correo desde Mi cuenta.');
        $this->browserRequest('PATCH', $uri($this->pending), ['email' => $this->account->email])->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'El correo electrónico ya está registrado.');
        $this->browserRequest('PATCH', $uri($this->pending), ['email' => 'nuevo@escuela.test', 'role' => 'ADMIN'])->assertUnprocessable()
            ->assertJsonValidationErrors('role');
        expect($this->pending->fresh()->email)->toBe('coordinacoin@escuela.test');
    });

    it('answers 404 for an account of another institution', function () {
        $other = User::factory()->forInstitution(Institution::factory()->create())->create(['password_setup_required' => true]);
        $this->loginWithCookies($this->admin)->assertOk();

        $this->browserRequest('PATCH', "/api/institutions/{$this->institution->id}/accounts/{$other->id}/email", ['email' => 'x@escuela.test'])->assertNotFound();
    });

    it('lets SECRETARY correct pending company accounts only while the company is active', function () {
        Notification::fake();
        $secretary = User::factory()->role(UserRole::SECRETARY)->create();
        $company = Company::factory()->create();
        $pending = User::factory()->forCompany($company)->create(['password_setup_required' => true]);
        $this->loginWithCookies($secretary)->assertOk();

        $this->browserRequest('PATCH', "/api/companies/{$company->id}/accounts/{$pending->id}/email", ['email' => 'rh@empresa.test'])->assertOk()
            ->assertJsonPath('data.email', 'rh@empresa.test');
        $company->forceFill(['is_active' => false])->save();
        $this->browserRequest('PATCH', "/api/companies/{$company->id}/accounts/{$pending->id}/email", ['email' => 'rh2@empresa.test'])->assertUnprocessable()
            ->assertJsonValidationErrors('company');
        $this->browserRequest('PATCH', "/api/admin-accounts/{$pending->id}/email", ['email' => 'x@empresa.test'])->assertForbidden();
    });

    it('lets ADMIN correct pending admin and secretary accounts', function (UserRole $role, string $prefix) {
        Notification::fake();
        $pending = User::factory()->role($role)->create(['password_setup_required' => true]);
        $this->loginWithCookies($this->admin)->assertOk();

        $this->browserRequest('PATCH', "/api/{$prefix}/{$pending->id}/email", ['email' => 'correcto@sedeco.test'])->assertOk()
            ->assertJsonPath('data.email', 'correcto@sedeco.test');
        $this->browserRequest('GET', "/api/{$prefix}")->assertOk()->assertJsonPath('data.0.email_verified', false);
    })->with([[UserRole::ADMIN, 'admin-accounts'], [UserRole::SECRETARY, 'secretary-accounts']]);
});

describe('T-S19-03: cambio de correo en Mi cuenta', function () {
    beforeEach(function () {
        Notification::fake();
        $this->loginWithCookies($this->account)->assertOk();
    });

    it('requires the current password and a new, free address', function () {
        requestEmailChange($this, ['current_password' => 'otra'])->assertUnprocessable()->assertJsonPath('errors.current_password.0', 'La contraseña actual no es correcta.');
        requestEmailChange($this, ['email' => 'COORDINACION@escuela.test'])->assertUnprocessable()->assertJsonPath('errors.email.0', 'El correo nuevo es igual al actual.');
        $taken = User::factory()->create();
        requestEmailChange($this, ['email' => $taken->email])->assertUnprocessable()->assertJsonPath('errors.email.0', 'Ese correo ya está registrado en otra cuenta.');
        requestEmailChange($this, ['role' => 'ADMIN'])->assertUnprocessable()->assertJsonValidationErrors('role');

        expect($this->account->fresh()->pending_email)->toBeNull();
        Notification::assertNothingSent();
    });

    it('keeps the current email active, emails the link to the new address and warns the current one', function () {
        requestEmailChange($this)->assertOk()
            ->assertJsonPath('user.email', 'coordinacion@escuela.test')
            ->assertJsonPath('user.pending_email', NEW_ACCESS_EMAIL)
            ->assertJsonPath('email_link_delivery', 'sent');

        Notification::assertSentOnDemand(ConfirmAccessEmail::class, fn (ConfirmAccessEmail $mail, array $channels, AnonymousNotifiable $to) => $to->routes['mail'] === NEW_ACCESS_EMAIL && $mail->change);
        Notification::assertSentTo($this->account, AccessEmailChangeRequested::class, fn (AccessEmailChangeRequested $notice) => $notice->pendingEmail === NEW_ACCESS_EMAIL);
        $account = $this->account->fresh();
        expect($account->email)->toBe('coordinacion@escuela.test')
            ->and($account->email_token_hash)->toHaveLength(64)
            ->and($account->email_token_hash)->not->toBe(sentEmailToken());
    });

    it('confirms the change: verified email, other sessions closed, notices, audit and the organization contact (D8)', function () {
        $thisDevice = $this->currentBrowserCookies();
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->account)->assertOk();
        $otherDevice = $this->currentBrowserCookies();
        DB::table('sessions')->update(['user_id' => $this->account->id]);
        $this->replaceBrowserCookies($thisDevice);
        DB::table('institution_password_reset_tokens')->insert(['email' => $this->account->email, 'token' => 'x', 'created_at' => now()]);

        requestEmailChange($this)->assertOk();
        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => sentEmailToken()])->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJson(['result' => 'changed', 'email' => NEW_ACCESS_EMAIL]);

        $account = $this->account->fresh();
        expect($account->email)->toBe(NEW_ACCESS_EMAIL)
            ->and($account->email_verified_at)->not->toBeNull()
            ->and($account->pending_email)->toBeNull()
            ->and($account->email_token_hash)->toBeNull()
            ->and($this->institution->fresh()->contact_email)->toBe(NEW_ACCESS_EMAIL)
            ->and(DB::table('institution_password_reset_tokens')->where('email', 'coordinacion@escuela.test')->exists())->toBeFalse();

        $this->browserRequest('GET', '/api/me')->assertOk()->assertJsonPath('user.email', NEW_ACCESS_EMAIL)->assertJsonPath('user.email_verified', true);
        $this->replaceBrowserCookies($otherDevice);
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();

        Notification::assertSentOnDemand(AccessEmailChanged::class, fn (AccessEmailChanged $notice, array $channels, AnonymousNotifiable $to) => $to->routes['mail'] === 'coordinacion@escuela.test' && $notice->toPreviousAddress);
        Notification::assertSentTo($account, AccessEmailChanged::class, fn (AccessEmailChanged $notice) => ! $notice->toPreviousAddress);
        $events = AccountAuditEvent::query()->orderBy('id')->get()->map(fn ($event) => [$event->event, $event->subject_type, $event->changed_fields])->all();
        expect($events)->toBe([['email_changed', 'user', ['email']], ['organization_profile_updated', 'institution', ['contact_email']]]);
    });

    it('leaves the organization contact alone when it was someone else', function () {
        $this->institution->forceFill(['contact_email' => 'otra.persona@escuela.test'])->save();
        requestEmailChange($this)->assertOk();
        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => sentEmailToken()])->assertOk();

        expect($this->institution->fresh()->contact_email)->toBe('otra.persona@escuela.test')
            ->and(AccountAuditEvent::query()->pluck('event')->all())->toBe(['email_changed']);
    });

    it('confirms without a session too', function () {
        requestEmailChange($this)->assertOk();
        $this->replaceBrowserCookies([]);
        $this->startCookieSession();

        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => sentEmailToken()])->assertOk()->assertJsonPath('result', 'changed');
        expect($this->account->fresh()->email)->toBe(NEW_ACCESS_EMAIL);
    });

    it('rejects an expired, used, replaced or cancelled link', function () {
        $confirm = fn (string $token) => $this->browserRequest('POST', '/api/account-email/confirm', ['token' => $token]);
        $invalid = 'El enlace no es válido: venció, ya se usó o el cambio se canceló.';

        requestEmailChange($this)->assertOk();
        $first = sentEmailToken();
        $this->travel(61)->minutes();
        $confirm($first)->assertUnprocessable()->assertJson(['code' => 'EMAIL_LINK_INVALID', 'message' => $invalid]);

        // Otra solicitud reemplaza la pendiente e invalida el enlace anterior.
        requestEmailChange($this, ['email' => 'otro.nuevo@escuela.test'])->assertOk()->assertJsonPath('user.pending_email', 'otro.nuevo@escuela.test');
        $second = sentEmailToken();
        $confirm($first)->assertUnprocessable();

        $this->browserRequest('POST', '/api/me/email/cancel')->assertOk()->assertJsonPath('user.pending_email', null);
        $confirm($second)->assertUnprocessable();
        $confirm('corto')->assertUnprocessable();
        expect($this->account->fresh()->email)->toBe('coordinacion@escuela.test');
    });

    it('cannot be used twice', function () {
        requestEmailChange($this)->assertOk();
        $token = sentEmailToken();
        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => $token])->assertOk();
        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => $token])->assertUnprocessable();
    });

    it('reports the conflict when the address was registered meanwhile and drops the pending change', function () {
        requestEmailChange($this)->assertOk();
        User::factory()->create(['email' => NEW_ACCESS_EMAIL]);

        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => sentEmailToken()])->assertStatus(409)
            ->assertJson(['code' => 'EMAIL_TAKEN', 'message' => 'Ese correo ya fue registrado en otra cuenta. Tu correo de acceso no cambió.']);
        expect($this->account->fresh())->email->toBe('coordinacion@escuela.test')->pending_email->toBeNull();
    });

    it('resends the link only after 60 seconds, with a new token', function () {
        requestEmailChange($this)->assertOk();
        $first = sentEmailToken();

        $this->browserRequest('POST', '/api/me/email/resend')->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->travel(61)->seconds();
        $this->browserRequest('POST', '/api/me/email/resend')->assertOk()->assertJsonPath('user.pending_email', NEW_ACCESS_EMAIL);
        $second = sentEmailToken();

        expect($second)->not->toBe($first);
        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => $first])->assertUnprocessable();
        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => $second])->assertOk();
    });
});

describe('T-S19-04: verificar el correo actual', function () {
    beforeEach(function () {
        Notification::fake();
        $this->loginWithCookies($this->account)->assertOk();
    });

    it('emails a verification link to the current address and marks it verified', function () {
        $this->browserRequest('POST', '/api/me/email/verification')->assertOk()->assertJsonPath('user.pending_email', null)
            ->assertJsonPath('email_link_delivery', 'sent');
        Notification::assertSentTo($this->account, ConfirmAccessEmail::class, fn (ConfirmAccessEmail $mail) => ! $mail->change);

        $this->browserRequest('POST', '/api/account-email/confirm', ['token' => sentEmailToken()])->assertOk()
            ->assertJson(['result' => 'verified', 'email' => 'coordinacion@escuela.test']);
        expect($this->account->fresh()->email_verified_at)->not->toBeNull();
        Notification::assertNotSentTo($this->account, AccessEmailChanged::class);

        $this->browserRequest('POST', '/api/me/email/verification')->assertUnprocessable()->assertJsonPath('errors.email.0', 'Tu correo de acceso ya está verificado.');
    });

    it('is not offered while a change is pending', function () {
        requestEmailChange($this)->assertOk();

        $this->browserRequest('POST', '/api/me/email/verification')->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'Tienes un cambio de correo pendiente: confírmalo o cancélalo primero.');
    });

    it('leaves the console change unverified and drops any pending change (D9)', function () {
        $admin = User::factory()->role(UserRole::ADMIN)->create(['email_verified_at' => now(), 'pending_email' => 'pendiente@sedeco.test', 'email_token_hash' => str_repeat('a', 64), 'email_token_sent_at' => now()]);

        $this->artisan('admin:update-email', ['current' => $admin->email, 'new' => 'recuperado@sedeco.test'])->assertSuccessful();

        expect($admin->fresh())->email->toBe('recuperado@sedeco.test')->email_verified_at->toBeNull()->pending_email->toBeNull()->email_token_hash->toBeNull();
    });
});
