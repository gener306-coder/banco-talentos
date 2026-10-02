<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->pendingUser = User::factory()->forInstitution(Institution::factory()->create())->create([
        'password_setup_required' => true,
    ]);
    $this->setupToken = Password::broker('institution_setup')->createToken($this->pendingUser);
    $this->setupPayload = [
        'email' => $this->pendingUser->email,
        'token' => $this->setupToken,
        'password' => 'InstitutionPassword123!',
        'password_confirmation' => 'InstitutionPassword123!',
    ];
    $this->startCookieSession();
});

it('lets the token holder set a hashed initial password anonymously and then sign in', function () {
    $originalHash = $this->pendingUser->password;
    $response = $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)
        ->assertNoContent();

    $user = $this->pendingUser->fresh();
    expect($user->password_setup_required)->toBeFalse();
    expect($user->password)->not->toBe($originalHash)->not->toBe($this->setupPayload['password']);
    expect(Hash::check($this->setupPayload['password'], $user->password))->toBeTrue();
    expect(Hash::check('Password123!', $user->password))->toBeFalse();
    expect($response->getContent())->not->toContain($this->setupToken, $user->password, $this->setupPayload['password']);
    $this->assertDatabaseMissing('institution_password_setup_tokens', ['email' => $user->email]);

    // Setting the credential does not create an authenticated session.
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
    $this->loginWithCookies($user, ['password' => $this->setupPayload['password']])
        ->assertOk()
        ->assertJsonPath('user.role', 'INSTITUTION')
        ->assertJsonPath('user.institution.id', $user->institution_id)
        ->assertJsonMissingPath('user.password');
    $this->browserRequest('GET', '/api/me')->assertOk()->assertJsonPath('user.id', $user->id);
    $this->browserRequest('GET', '/api/institutions')->assertForbidden();
});

it('consumes the token once and rejects replay without changing the chosen password', function () {
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)->assertNoContent();
    $chosenHash = $this->pendingUser->fresh()->password;

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'password' => 'AttackerReplacement123!',
        'password_confirmation' => 'AttackerReplacement123!',
    ]))->assertUnprocessable()->assertJsonValidationErrors('token');

    expect($this->pendingUser->fresh()->password)->toBe($chosenHash);
    expect($this->pendingUser->fresh()->password_setup_required)->toBeFalse();
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
});

it('rejects invalid tokens and unknown email addresses with the same token error', function () {
    $original = $this->pendingUser->fresh()->getAttributes();
    $invalid = $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'token' => 'invalid-token',
    ]))->assertUnprocessable()->assertJsonValidationErrors('token')->json();
    $unknown = $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'email' => 'unknown@example.test',
    ]))->assertUnprocessable()->assertJsonValidationErrors('token')->json();

    expect($invalid)->toBe($unknown);
    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->setupToken))->toBeTrue();
});

it('binds a setup token to exactly one email account', function () {
    $other = User::factory()->forInstitution(Institution::factory()->create())->create(['password_setup_required' => true]);
    $otherOriginal = $other->fresh()->getAttributes();
    $original = $this->pendingUser->fresh()->getAttributes();
    Password::broker('institution_setup')->createToken($other);

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'email' => $other->email,
    ]))->assertUnprocessable()->assertJsonValidationErrors('token');

    expect($other->fresh()->getAttributes())->toBe($otherOriginal);
    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
});

it('expires the initial setup token after sixty minutes without modifying the account', function () {
    $original = $this->pendingUser->fresh()->getAttributes();
    DB::table('institution_password_setup_tokens')->where('email', $this->pendingUser->email)
        ->update(['created_at' => now()->subMinutes(61)]);

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)
        ->assertUnprocessable()->assertJsonValidationErrors('token');

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
});

it('does not turn setup into password recovery for an existing account', function () {
    $this->pendingUser->forceFill(['password_setup_required' => false])->save();
    $original = $this->pendingUser->fresh()->getAttributes();

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)
        ->assertUnprocessable()->assertJsonValidationErrors('token');

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
});

it('does not set passwords for roles outside institutional account creation', function (UserRole $role) {
    $this->pendingUser->update(['role' => $role]);
    $original = $this->pendingUser->fresh()->getAttributes();

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)
        ->assertUnprocessable()->assertJsonValidationErrors('token');

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
})->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

it('preserves the token and pending credential when the institution or account is inactive', function (string $target, string $code) {
    if ($target === 'institution') {
        $this->pendingUser->institution->forceFill(['is_active' => false])->save();
    } else {
        $this->pendingUser->update(['is_active' => false]);
    }
    $original = $this->pendingUser->fresh()->getAttributes();

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)
        ->assertForbidden()->assertJsonPath('code', $code);

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->setupToken))->toBeTrue();

    if ($target === 'institution') {
        $this->pendingUser->institution->forceFill(['is_active' => true])->save();
    } else {
        $this->pendingUser->update(['is_active' => true]);
    }

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)->assertNoContent();
})->with([
    'institution' => ['institution', 'INSTITUTION_INACTIVE'],
    'account' => ['account', 'ACCOUNT_INACTIVE'],
]);

it('accepts passwords at the twelve-character minimum and seventy-two-byte maximum', function (string $password) {
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'password' => $password,
        'password_confirmation' => $password,
    ]))->assertNoContent();

    expect(Hash::check($password, $this->pendingUser->fresh()->password))->toBeTrue();
})->with([
    'twelve characters' => ['Password123!'],
    'seventy-two ASCII bytes' => [str_repeat('a', 72)],
    'thirty-six accented characters' => [str_repeat('é', 36)],
    'eighteen emoji characters' => [str_repeat('🔒', 18)],
]);

it('rejects short over-byte-limit and NUL passwords without consuming the token', function (mixed $password) {
    $original = $this->pendingUser->fresh()->getAttributes();

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'password' => $password,
        'password_confirmation' => $password,
    ]))->assertUnprocessable()->assertJsonValidationErrors('password');

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->setupToken))->toBeTrue();
})->with([
    'eleven ASCII characters' => [str_repeat('a', 11)],
    'eleven multibyte characters' => [str_repeat('é', 11)],
    'seventy-three ASCII bytes' => [str_repeat('a', 73)],
    'thirty-seven accents exceed byte limit' => [str_repeat('é', 37)],
    'nineteen emojis exceed byte limit' => [str_repeat('🔒', 19)],
    'NUL embedded' => ["Password\0Secret123!"],
    'non-string password' => [['invalid']],
    'null password' => [null],
]);

it('requires valid email token password and matching confirmation', function (array $overrides, array $fields) {
    $original = $this->pendingUser->fresh()->getAttributes();

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, $overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($fields);

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->setupToken))->toBeTrue();
})->with([
    'missing email' => [['email' => null], ['email']],
    'invalid email' => [['email' => 'not-an-email'], ['email']],
    'non-string email' => [['email' => ['invalid']], ['email']],
    'missing token' => [['token' => null], ['token']],
    'non-string token' => [['token' => ['invalid']], ['token']],
    'missing password' => [['password' => null, 'password_confirmation' => null], ['password']],
    'missing confirmation' => [['password_confirmation' => null], ['password']],
    'mismatched confirmation' => [['password_confirmation' => 'AnotherPassword123!'], ['password']],
]);

it('normalizes the token email while leaving the password unchanged', function () {
    $password = '  Exact password123!  ';
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'email' => '  '.strtoupper($this->pendingUser->email).'  ',
        'password' => $password,
        'password_confirmation' => $password,
    ]))->assertNoContent();

    expect(Hash::check($password, $this->pendingUser->fresh()->password))->toBeTrue();
    expect(Hash::check(trim($password), $this->pendingUser->fresh()->password))->toBeFalse();
});

it('ignores account data injected into password setup', function () {
    $institutionId = $this->pendingUser->institution_id;
    $name = $this->pendingUser->name;
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'role' => 'ADMIN',
        'institution_id' => Institution::factory()->create()->id,
        'is_active' => false,
        'name' => 'Forged name',
        'password_setup_required' => true,
    ]))->assertNoContent();

    $user = $this->pendingUser->fresh();
    expect($user->role)->toBe(UserRole::INSTITUTION);
    expect($user->institution_id)->toBe($institutionId);
    expect($user->name)->toBe($name);
    expect($user->is_active)->toBeTrue();
    expect($user->password_setup_required)->toBeFalse();
});

it('requires real CSRF protection on the public setup endpoint', function (?string $csrfToken) {
    $original = $this->pendingUser->fresh()->getAttributes();
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload,
        csrf: false, headers: $csrfToken === null ? [] : ['X-XSRF-TOKEN' => $csrfToken])
        ->assertStatus(419);

    expect($this->pendingUser->fresh()->getAttributes())->toBe($original);
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->setupToken))->toBeTrue();
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)->assertNoContent();
})->with(['missing' => [null], 'invalid' => ['forged-csrf-token']]);

it('throttles repeated setup attempts without consuming a valid token', function () {
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
            'token' => 'invalid-token-'.$attempt,
        ]))->assertUnprocessable();
    }

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $this->setupPayload)
        ->assertTooManyRequests()->assertHeader('Retry-After');

    expect($this->pendingUser->fresh()->password_setup_required)->toBeTrue();
    expect(Password::broker('institution_setup')->tokenExists($this->pendingUser, $this->setupToken))->toBeTrue();
});

it('hashes a bcrypt-shaped password as the literal credential rather than accepting its embedded hash', function () {
    $shortPreimage = 'short';
    $literalPassword = Hash::make($shortPreimage);
    expect(strlen($literalPassword))->toBe(60);

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($this->setupPayload, [
        'password' => $literalPassword,
        'password_confirmation' => $literalPassword,
    ]))->assertNoContent();

    $storedHash = $this->pendingUser->fresh()->password;
    expect($storedHash)->not->toBe($literalPassword);
    expect(Hash::check($literalPassword, $storedHash))->toBeTrue();
    expect(Hash::check($shortPreimage, $storedHash))->toBeFalse();

    $this->loginWithCookies($this->pendingUser, ['password' => $literalPassword])->assertOk();
});
