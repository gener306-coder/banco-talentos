<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

const NEW_PASSWORD = 'NuevaContrasena123!';

beforeEach(function () {
    Notification::fake();
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->admin = User::factory()->role(UserRole::ADMIN)->create();
    $this->startPayload = ['email' => $this->account->email, 'institution_id' => $this->institution->id];
    $this->loginWithCookies($this->admin)->assertOk();
    $this->adminCookies = $this->currentBrowserCookies();

    // Inicia el restablecimiento como ADMIN y devuelve el token del correo enviado.
    $this->startReset = function (?User $account = null): string {
        $account ??= $this->account;
        $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', [
            'email' => $account->email, 'institution_id' => $account->institution_id,
        ])->assertOk()->assertJsonPath('reset_delivery', 'sent');
        $url = null;
        Notification::assertSentTo($account, ResetInstitutionPassword::class, function ($notification) use (&$url) {
            $url = $notification->resetUrl;

            return true;
        });
        parse_str(parse_url($url, PHP_URL_QUERY), $query);

        return $query['token'];
    };

    // Envía el formulario público desde un navegador sin sesión.
    $this->holderReset = function (array $overrides = []) {
        $this->replaceBrowserCookies([]);
        $this->startCookieSession();

        return $this->browserRequest('POST', '/api/institution-accounts/password-reset', array_replace([
            'email' => $this->account->email,
            'password' => NEW_PASSWORD,
            'password_confirmation' => NEW_PASSWORD,
        ], $overrides));
    };
});

it('lets ADMIN start a reset that mails a temporary link without exposing secrets (CA-02, CA-04, CA-11)', function () {
    $original = $this->account->fresh()->getAttributes();
    $response = $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->startPayload)
        ->assertOk()
        ->assertExactJson(['reset_delivery' => 'sent'])
        ->assertHeader('Cache-Control', 'no-store, private');

    $url = null;
    Notification::assertSentTo($this->account, ResetInstitutionPassword::class, function ($notification, array $channels) use (&$url) {
        $url = $notification->resetUrl;

        return $channels === ['mail'];
    });
    Notification::assertCount(1);
    expect(parse_url($url, PHP_URL_PATH))->toBe('/reset-password');
    expect(str_starts_with($url, config('app.frontend_url')))->toBeTrue();
    parse_str(parse_url($url, PHP_URL_QUERY), $query);
    expect($query['email'])->toBe($this->account->email);
    expect($query['token'])->toMatch('/\A[a-f0-9]{64}\z/');

    // Persistido como hash, nunca en texto plano ni en la respuesta.
    $stored = DB::table('institution_password_reset_tokens')->where('email', $this->account->email)->value('token');
    expect($stored)->not->toBe($query['token']);
    expect(Hash::check($query['token'], $stored))->toBeTrue();
    expect($response->getContent())->not->toContain($query['token'], $stored, $this->account->password, 'reset_url');
    expect($this->account->fresh()->getAttributes())->toBe($original);
});

it('changes nothing until the holder resets, and the current password keeps working meanwhile', function () {
    ($this->startReset)();
    $this->replaceBrowserCookies([]);
    $this->loginWithCookies($this->account)->assertOk();
});

it('lets only the holder set a hashed password with the token and then sign in (CA-08, CA-10)', function () {
    $token = ($this->startReset)();
    $originalHash = $this->account->fresh()->password;

    $response = ($this->holderReset)(['token' => $token])
        ->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');

    $user = $this->account->fresh();
    expect($user->password)->not->toBe($originalHash)->not->toBe(NEW_PASSWORD);
    expect(Hash::check(NEW_PASSWORD, $user->password))->toBeTrue();
    expect(Hash::check('Password123!', $user->password))->toBeFalse();
    expect($response->getContent())->toBe('');
    $this->assertDatabaseMissing('institution_password_reset_tokens', ['email' => $user->email]);
    expect($user->only(['role', 'institution_id', 'is_active', 'password_setup_required']))
        ->toBe(['role' => UserRole::INSTITUTION, 'institution_id' => $this->institution->id, 'is_active' => true, 'password_setup_required' => false]);

    // Restablecer no inicia sesión.
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
    $this->loginWithCookies($user)->assertUnprocessable();
    $this->loginWithCookies($user, ['password' => NEW_PASSWORD])->assertOk()
        ->assertJsonPath('user.role', 'INSTITUTION')
        ->assertJsonMissingPath('user.password');
});

it('requires an ADMIN session to start a reset (CA-01, CA-12)', function (?UserRole $role) {
    $this->replaceBrowserCookies([]);
    if ($role === null) {
        $this->startCookieSession();
    } else {
        $actor = $role === UserRole::INSTITUTION
            ? User::factory()->forInstitution($this->institution)->create()
            : User::factory()->role($role)->create();
        $this->loginWithCookies($actor)->assertOk();
    }

    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->startPayload)
        ->assertStatus($role === null ? 401 : 403);
    Notification::assertNothingSent();
    $this->assertDatabaseCount('institution_password_reset_tokens', 0);
})->with([
    'guest' => [null],
    'institution' => [UserRole::INSTITUTION],
    'company' => [UserRole::COMPANY],
    'secretary' => [UserRole::SECRETARY],
]);

it('only resets active, configured INSTITUTION accounts of the given active institution', function (array|Closure $target, string $field) {
    $payload = $target instanceof Closure ? $target->call($this) : $target;
    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $payload)
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    Notification::assertNothingSent();
    $this->assertDatabaseCount('institution_password_reset_tokens', 0);
})->with([
    'admin account' => [fn () => ['email' => $this->admin->email, 'institution_id' => $this->institution->id], 'email'],
    'company account' => [fn () => ['email' => User::factory()->role(UserRole::COMPANY)->create()->email, 'institution_id' => $this->institution->id], 'email'],
    'secretary account' => [fn () => ['email' => User::factory()->role(UserRole::SECRETARY)->create()->email, 'institution_id' => $this->institution->id], 'email'],
    'unknown email' => [fn () => ['email' => 'nadie@example.test', 'institution_id' => $this->institution->id], 'email'],
    'account of another institution' => [fn () => ['email' => $this->account->email, 'institution_id' => Institution::factory()->create()->id], 'email'],
    'inactive account' => [fn () => tap($this->startPayload, fn () => $this->account->forceFill(['is_active' => false])->save()), 'email'],
    'inactive institution' => [fn () => tap($this->startPayload, fn () => $this->institution->forceFill(['is_active' => false])->save()), 'institution_id'],
    'missing institution' => [fn () => ['email' => $this->account->email, 'institution_id' => 999999], 'institution_id'],
    'invalid institution id' => [fn () => ['email' => $this->account->email, 'institution_id' => 'abc'], 'institution_id'],
    'missing email' => [fn () => ['institution_id' => $this->institution->id], 'email'],
]);

it('refers accounts pending initial setup to the setup flow', function () {
    $this->account->forceFill(['password_setup_required' => true])->save();
    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->startPayload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email' => 'Reenvía el enlace de configuración']);
    Notification::assertNothingSent();
    $this->assertDatabaseCount('institution_password_reset_tokens', 0);
});

it('rejects any password chosen by ADMIN (CA-03)', function (array $fields) {
    $hash = $this->account->fresh()->password;
    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', [...$this->startPayload, ...$fields])
        ->assertUnprocessable()->assertJsonValidationErrors(array_keys($fields));
    expect($this->account->fresh()->password)->toBe($hash);
    Notification::assertNothingSent();
    $this->assertDatabaseCount('institution_password_reset_tokens', 0);
})->with([
    'password' => [['password' => 'AdminChoice123!']],
    'confirmation' => [['password_confirmation' => 'AdminChoice123!']],
    'both' => [['password' => 'AdminChoice123!', 'password_confirmation' => 'AdminChoice123!']],
]);

it('rejects invalid, foreign, expired, replayed and superseded tokens without changing the password (CA-05, CA-06, CA-07)', function (string $case) {
    $other = User::factory()->forInstitution($this->institution)->create();
    $token = ($this->startReset)();
    $payload = ['token' => $token];

    match ($case) {
        'invalid' => $payload['token'] = str_repeat('a', 64),
        'malformed' => $payload['token'] = 'not-a-token',
        'other account' => $payload['email'] = $other->email,
        'expired' => $this->travel(61)->minutes(),
        'replayed' => ($this->holderReset)($payload)->assertNoContent(),
        'superseded' => (function () {
            $this->travel(61)->seconds();
            $this->replaceBrowserCookies($this->adminCookies);
            ($this->startReset)();
        })(),
        'setup token' => $payload['token'] = Password::broker('institution_setup')->createToken($this->account),
    };
    $hashes = [$this->account->fresh()->password, $other->fresh()->password];

    ($this->holderReset)(array_replace($payload, [
        'password' => 'OtraContrasena456!', 'password_confirmation' => 'OtraContrasena456!',
    ]))->assertUnprocessable()->assertJsonValidationErrors(['token' => 'no es válido o ha expirado']);

    expect([$this->account->fresh()->password, $other->fresh()->password])->toBe($hashes);
})->with(['invalid', 'malformed', 'other account', 'expired', 'replayed', 'superseded', 'setup token']);

it('answers unknown accounts and other roles exactly like an invalid token', function (string|Closure $email) {
    $email = $email instanceof Closure ? $email->call($this) : $email;
    $token = ($this->startReset)();
    $response = ($this->holderReset)(['token' => $token, 'email' => $email])->assertUnprocessable();
    expect($response->json())->toBe(['message' => 'El enlace de restablecimiento no es válido o ha expirado.', 'errors' => [
        'token' => ['El enlace de restablecimiento no es válido o ha expirado.'],
    ]]);
})->with([
    'unknown' => [fn () => 'nadie@example.test'],
    'admin' => [fn () => $this->admin->email],
]);

it('enforces the system password policy and keeps the token usable (CA-09)', function (array $fields) {
    $token = ($this->startReset)();
    $hash = $this->account->fresh()->password;
    ($this->holderReset)(['token' => $token, ...$fields])->assertUnprocessable()->assertJsonValidationErrors('password');
    expect($this->account->fresh()->password)->toBe($hash);
    expect(Password::broker('institution_reset')->tokenExists($this->account, $token))->toBeTrue();
})->with([
    'too short' => [['password' => 'Corta123!', 'password_confirmation' => 'Corta123!']],
    'over 72 bytes' => [['password' => str_repeat('ñ', 37), 'password_confirmation' => str_repeat('ñ', 37)]],
    'null byte' => [['password' => "Contrasena\0Segura1", 'password_confirmation' => "Contrasena\0Segura1"]],
    'mismatch' => [['password' => NEW_PASSWORD, 'password_confirmation' => 'Diferente12345!']],
    'missing' => [['password' => null, 'password_confirmation' => null]],
]);

it('blocks consumption for inactive accounts or institutions without spending the token', function (string $model) {
    $token = ($this->startReset)();
    $hash = $this->account->fresh()->password;
    ($model === 'account' ? $this->account : $this->institution)->forceFill(['is_active' => false])->save();
    Log::spy();

    ($this->holderReset)(['token' => $token])->assertForbidden()
        ->assertJsonPath('code', $model === 'account' ? 'ACCOUNT_INACTIVE' : 'INSTITUTION_INACTIVE');
    // Una denegación esperada no se registra como error de la aplicación.
    Log::shouldNotHaveReceived('error');
    expect($this->account->fresh()->password)->toBe($hash);
    expect(Password::broker('institution_reset')->tokenExists($this->account, $token))->toBeTrue();
})->with(['account', 'institution']);

it('invalidates every cookie session of the account once the password is reset (CA-13)', function () {
    // Dos sesiones abiertas de la cuenta institucional, en navegadores distintos.
    $this->replaceBrowserCookies([]);
    $this->loginWithCookies($this->account)->assertOk();
    $this->browserRequest('GET', '/api/me')->assertOk();
    $usedSession = $this->currentBrowserCookies();
    $this->replaceBrowserCookies([]);
    $this->loginWithCookies($this->account)->assertOk();
    $idleSession = $this->currentBrowserCookies();

    $this->replaceBrowserCookies($this->adminCookies);
    $token = ($this->startReset)();

    // Iniciar el proceso no cierra las sesiones: la contraseña aún no cambió.
    $this->replaceBrowserCookies($usedSession);
    $this->browserRequest('GET', '/api/me')->assertOk();

    ($this->holderReset)(['token' => $token])->assertNoContent();

    foreach ([$usedSession, $idleSession] as $cookies) {
        $this->replaceBrowserCookies($cookies);
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();
        // La sesión se vació: la misma cookie tampoco autentica en la petición siguiente.
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();
    }

    // Las sesiones de otros usuarios no se ven afectadas.
    $this->replaceBrowserCookies($this->adminCookies);
    $this->browserRequest('GET', '/api/me')->assertOk()->assertJsonPath('user.id', $this->admin->id);

    $this->replaceBrowserCookies([]);
    $this->loginWithCookies($this->account, ['password' => NEW_PASSWORD])->assertOk();
    $this->browserRequest('GET', '/api/me')->assertOk()->assertJsonPath('user.id', $this->account->id);
});

it('requires CSRF on both endpoints', function () {
    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->startPayload, csrf: false)
        ->assertStatus(419);
    $this->replaceBrowserCookies([]);
    $this->startCookieSession();
    $this->browserRequest('POST', '/api/institution-accounts/password-reset', [
        'email' => $this->account->email, 'token' => str_repeat('a', 64),
        'password' => NEW_PASSWORD, 'password_confirmation' => NEW_PASSWORD,
    ], csrf: false)->assertStatus(419);
    Notification::assertNothingSent();
});

it('enforces a minimum interval between resets without rotating the token', function () {
    $token = ($this->startReset)();
    $stored = DB::table('institution_password_reset_tokens')->value('token');

    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->startPayload)
        ->assertTooManyRequests()->assertHeader('Retry-After', '60');
    expect(DB::table('institution_password_reset_tokens')->value('token'))->toBe($stored);
    expect(Password::broker('institution_reset')->tokenExists($this->account, $token))->toBeTrue();
    Notification::assertSentToTimes($this->account, ResetInstitutionPassword::class, 1);
});

it('limits start requests per ADMIN', function () {
    $accounts = User::factory()->forInstitution($this->institution)->count(11)->create();
    foreach ($accounts->take(10) as $account) {
        $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', [
            'email' => $account->email, 'institution_id' => $this->institution->id,
        ])->assertOk();
    }
    $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', [
        'email' => $accounts->last()->email, 'institution_id' => $this->institution->id,
    ])->assertTooManyRequests()->assertHeader('Retry-After');
    Notification::assertNotSentTo($accounts->last(), ResetInstitutionPassword::class);
});

it('limits reset attempts per email', function () {
    $token = ($this->startReset)();
    $this->replaceBrowserCookies([]);
    $this->startCookieSession();
    $attempt = fn () => $this->browserRequest('POST', '/api/institution-accounts/password-reset', [
        'email' => $this->account->email, 'token' => str_repeat('b', 64),
        'password' => NEW_PASSWORD, 'password_confirmation' => NEW_PASSWORD,
    ]);
    foreach (range(1, 5) as $ignored) {
        $attempt()->assertUnprocessable();
    }
    $attempt()->assertTooManyRequests()->assertHeader('Retry-After');
    expect(Password::broker('institution_reset')->tokenExists($this->account, $token))->toBeTrue();
});
