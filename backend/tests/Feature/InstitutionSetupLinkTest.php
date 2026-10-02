<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->pendingUser = User::factory()->forInstitution($this->institution)->create(['password_setup_required' => true]);
    $this->oldToken = Password::broker('institution_setup')->createToken($this->pendingUser);
    DB::table('institution_password_setup_tokens')->where('email', $this->pendingUser->email)
        ->update(['created_at' => now()->subMinutes(2)]);
    $this->resendPayload = ['email' => $this->pendingUser->email, 'institution_id' => $this->institution->id];
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
});

it('renews only the pending link and lets its holder finish setup without changing account identity', function () {
    $original = $this->pendingUser->fresh()->getAttributes();
    $response = $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertOk()->assertJsonPath('setup_delivery', 'testing')->assertJsonMissingPath('password');
    parse_str(parse_url($response->json('setup_url'), PHP_URL_QUERY), $query);
    expect($query['token'])->not->toBe($this->oldToken);
    expect($query['email'])->toBe($this->pendingUser->email);
    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeFalse();
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $query['token']))->toBeTrue();
    $this->assertDatabaseCount('users', 2);
    $this->assertDatabaseCount('institution_password_setup_tokens', 1);

    $payload = [
        'email' => $this->pendingUser->email,
        'token' => $this->oldToken,
        'password' => 'HolderPassword123!',
        'password_confirmation' => 'HolderPassword123!',
    ];
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $payload)
        ->assertUnprocessable()->assertJsonValidationErrors('token');
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($payload, ['token' => $query['token']]))
        ->assertNoContent();
    $chosenHash = $this->pendingUser->fresh()->password;
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertUnprocessable()->assertJsonValidationErrors('email');
    expect($this->pendingUser->fresh()->password)->toBe($chosenHash);
    $this->loginWithCookies($this->pendingUser, ['password' => $payload['password']])->assertOk();
});

it('recovers pending accounts whose original token is expired or absent', function (bool $missing) {
    $tokens = DB::table('institution_password_setup_tokens')->where('email', $this->pendingUser->email);
    if ($missing) {
        $tokens->delete();
    } else {
        $tokens->update(['created_at' => now()->subMinutes(61)]);
    }
    $password = $this->pendingUser->fresh()->password;
    $response = $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)->assertOk();
    parse_str(parse_url($response->json('setup_url'), PHP_URL_QUERY), $query);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $query['token']))->toBeTrue();
    expect($this->pendingUser->fresh()->password)->toBe($password);
})->with(['missing' => [true], 'expired' => [false]]);

it('normalizes the lookup email and ignores forged recipient and password fields', function () {
    $original = $this->pendingUser->fresh()->getAttributes();
    $response = $this->browserRequest('POST', '/api/institution-accounts/resend-setup', [
        ...$this->resendPayload,
        'email' => '  '.strtoupper($this->pendingUser->email).'  ',
        'to' => 'attacker@example.test',
        'password' => 'AdministratorSecret!',
        'role' => 'ADMIN',
        'password_setup_required' => false,
    ])->assertOk();
    parse_str(parse_url($response->json('setup_url'), PHP_URL_QUERY), $query);
    expect($query['email'])->toBe($this->pendingUser->email);
    expect($response->getContent())->not->toContain('attacker@example.test', 'AdministratorSecret!');
    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
});

it('rejects accounts outside pending active institutional setup', function (array $attributes) {
    $this->pendingUser->forceFill($attributes)->save();
    $original = $this->pendingUser->fresh()->getAttributes();
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertUnprocessable()->assertJsonValidationErrors('email');
    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
})->with([
    'already configured' => [['password_setup_required' => false]],
    'inactive account' => [['is_active' => false]],
    'no institution' => [['institution_id' => null]],
    'admin role' => [['role' => UserRole::ADMIN]],
    'company role' => [['role' => UserRole::COMPANY]],
    'secretary role' => [['role' => UserRole::SECRETARY]],
]);

it('rejects a different institution or unknown account without issuing a token', function (bool $differentInstitution) {
    $data = $this->resendPayload;
    if ($differentInstitution) {
        $data['institution_id'] = Institution::factory()->create()->id;
    } else {
        $data['email'] = 'unknown@example.test';
    }
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $data)
        ->assertUnprocessable()->assertJsonValidationErrors('email');
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
    $this->assertDatabaseCount('institution_password_setup_tokens', 1);
})->with(['different institution' => [true], 'unknown email' => [false]]);

it('rejects an inactive institution without changing its pending account', function () {
    $this->institution->forceFill(['is_active' => false])->save();
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertUnprocessable()->assertJsonValidationErrors('institution_id');
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
});

it('validates resend fields without issuing tokens', function (array $changes, string $field) {
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', array_replace($this->resendPayload, $changes))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
})->with([
    'email required' => [['email' => null], 'email'],
    'email invalid' => [['email' => 'invalid'], 'email'],
    'email array' => [['email' => ['invalid']], 'email'],
    'email too long' => [['email' => str_repeat('a', 255).'@example.test'], 'email'],
    'institution required' => [['institution_id' => null], 'institution_id'],
    'institution array' => [['institution_id' => []], 'institution_id'],
    'institution noninteger' => [['institution_id' => 'invalid'], 'institution_id'],
    'institution missing' => [['institution_id' => 99999999], 'institution_id'],
]);

it('rejects unauthenticated resend even with valid CSRF', function () {
    $this->browserRequest('POST', '/api/logout')->assertNoContent();
    $this->startCookieSession();
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)->assertUnauthorized();
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
});

it('rejects resend for every non-admin role', function (UserRole $role) {
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)->assertForbidden();
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
})->with([UserRole::INSTITUTION, UserRole::COMPANY, UserRole::SECRETARY]);

it('requires real CSRF protection to resend', function (?string $token) {
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload,
        csrf: false, headers: $token === null ? [] : ['X-XSRF-TOKEN' => $token])
        ->assertStatus(419);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
})->with(['missing' => [null], 'invalid' => ['forged-csrf-token']]);

it('enforces the persisted sixty-second cooldown without rotating the token', function () {
    DB::table('institution_password_setup_tokens')->where('email', $this->pendingUser->email)
        ->update(['created_at' => now()]);
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertTooManyRequests()->assertHeader('Retry-After', '60');
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();

    $this->travel(61)->seconds();
    $response = $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)->assertOk();
    parse_str(parse_url($response->json('setup_url'), PHP_URL_QUERY), $query);
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertTooManyRequests();
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $query['token']))->toBeTrue();
});

it('limits aggregate resend attempts by administrator', function () {
    for ($attempt = 0; $attempt < 10; $attempt++) {
        $this->browserRequest('POST', '/api/institution-accounts/resend-setup', [])
            ->assertUnprocessable();
    }
    $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $this->resendPayload)
        ->assertTooManyRequests()->assertHeader('Retry-After');
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->oldToken))->toBeTrue();
});
