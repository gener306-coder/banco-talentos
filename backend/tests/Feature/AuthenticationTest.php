<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();

    // These probes exist only in the test application: no business modules or
    // production endpoints are added just to exercise role authorization.
    foreach (['ADMIN', 'INSTITUTION', 'COMPANY', 'SECRETARY'] as $role) {
        Route::get('/_tests/roles/'.$role, fn () => response()->json(['allowed' => true]))
            ->middleware(['web', 'auth:sanctum', 'active', 'role:'.$role]);
    }
});

dataset('account roles', ['ADMIN', 'INSTITUTION', 'COMPANY', 'SECRETARY']);

dataset('role authorization matrix', (function () {
    $matrix = [];

    foreach (['ADMIN', 'INSTITUTION', 'COMPANY', 'SECRETARY'] as $actual) {
        foreach (['ADMIN', 'INSTITUTION', 'COMPANY', 'SECRETARY'] as $required) {
            $matrix[$actual.' accessing '.$required] = [$actual, $required];
        }
    }

    return $matrix;
})());

it('logs in each allowed role and restores its identity from the session cookie', function (string $role) {
    $user = User::factory()->create(['role' => UserRole::from($role)]);
    $expected = ['user' => [
        'id' => $user->id,
        'name' => $user->name,
        'email' => $user->email,
        'role' => $role,
    ]];

    $this->loginWithCookies($user)->assertOk()->assertExactJson($expected);
    $this->browserRequest('GET', '/api/me')->assertOk()->assertExactJson($expected);
})->with('account roles');

it('returns the same generic error for a wrong password, unknown account and inactive account', function () {
    $active = User::factory()->create();
    $inactive = User::factory()->create(['is_active' => false]);
    $this->startCookieSession();
    $responses = [];

    foreach ([
        [$active->email, 'incorrect-password'],
        ['missing@example.test', 'Password123!'],
        [$inactive->email, 'Password123!'],
    ] as [$email, $password]) {
        $responses[] = $this->browserRequest('POST', '/api/login', compact('email', 'password'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email')
            ->json();

        $this->browserRequest('GET', '/api/me')->assertUnauthorized();
    }

    expect($responses[0])->toBe($responses[1])->toBe($responses[2]);
});

it('validates missing and malformed credentials on the backend', function (array $payload, array $fields) {
    $this->startCookieSession();

    $this->browserRequest('POST', '/api/login', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($fields);
})->with([
    'missing fields' => [[], ['email', 'password']],
    'invalid email' => [['email' => 'not-an-email', 'password' => 'Password123!'], ['email']],
    'non-string password' => [['email' => 'person@example.test', 'password' => ['invalid']], ['password']],
]);

it('rejects anonymous identity requests with JSON 401', function () {
    $this->browserRequest('GET', '/api/me')
        ->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json')
        ->assertJsonStructure(['message']);
});

it('rejects anonymous logout after a valid CSRF handshake', function () {
    $this->startCookieSession();

    $this->browserRequest('POST', '/api/logout')
        ->assertUnauthorized()
        ->assertJsonStructure(['message']);
});

it('rejects an arbitrary bearer token without querying a personal token table', function (string $token) {
    expect(Schema::hasTable('personal_access_tokens'))->toBeFalse();

    $this->browserRequest('GET', '/api/me', headers: ['Authorization' => 'Bearer '.$token])
        ->assertUnauthorized()
        ->assertJsonStructure(['message']);
})->with(['not-a-session', '1|arbitrary-token']);

it('rotates the anonymous session identifier at login', function () {
    $user = User::factory()->create();
    $this->startCookieSession();
    $anonymousId = $this->currentSessionId();
    $anonymousCookies = $this->currentBrowserCookies();

    $this->browserRequest('POST', '/api/login', [
        'email' => $user->email,
        'password' => 'Password123!',
    ])->assertOk();

    expect($this->currentSessionId())->not->toBe($anonymousId);
    expect(is_file($this->sessionFile($anonymousId)))->toBeFalse();
    $authenticatedCookies = $this->currentBrowserCookies();

    $this->replaceBrowserCookies($anonymousCookies);
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();

    $this->replaceBrowserCookies($authenticatedCookies);
    $this->browserRequest('GET', '/api/me')->assertOk()->assertJsonPath('user.id', $user->id);
});

it('invalidates the server session on logout and rejects replay of the old cookie', function () {
    $user = User::factory()->create();
    $this->loginWithCookies($user)->assertOk();
    $this->browserRequest('GET', '/api/me')->assertOk();
    $oldCookies = $this->currentBrowserCookies();
    $oldId = $this->currentSessionId();

    $this->browserRequest('POST', '/api/logout')->assertNoContent();

    expect($this->currentSessionId())->not->toBe($oldId);
    expect(is_file($this->sessionFile($oldId)))->toBeFalse();
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();

    $this->replaceBrowserCookies($oldCookies);
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
});

it('rejects an expired file session even when the browser keeps its cookie', function () {
    $user = User::factory()->create();
    $this->loginWithCookies($user)->assertOk();
    $sessionFile = $this->sessionFile($this->currentSessionId());

    touch($sessionFile, time() - ((config('session.lifetime') + 1) * 60));
    clearstatcache(true, $sessionFile);

    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
});

it('rejects an account deactivated after successful authentication', function () {
    $user = User::factory()->create();
    $this->loginWithCookies($user)->assertOk();
    $oldCookies = $this->currentBrowserCookies();
    $oldId = $this->currentSessionId();

    $user->update(['is_active' => false]);

    $this->browserRequest('GET', '/api/me')
        ->assertUnauthorized()
        ->assertJsonStructure(['message']);

    expect(is_file($this->sessionFile($oldId)))->toBeFalse();
    $this->replaceBrowserCookies($oldCookies);
    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
});

it('does not expose password hashes or authentication tokens in identity JSON', function () {
    $user = User::factory()->create();
    $storedHash = $user->getRawOriginal('password');

    expect($storedHash)->not->toBe('Password123!');
    expect(Hash::check('Password123!', $storedHash))->toBeTrue();
    expect($user->toArray())->not->toHaveKeys(['password']);

    foreach ([
        $this->loginWithCookies($user)->assertOk(),
        $this->browserRequest('GET', '/api/me')->assertOk(),
    ] as $response) {
        $response->assertJsonMissingPath('user.password')
            ->assertJsonMissingPath('user.remember_token')
            ->assertJsonMissingPath('token');

        expect($response->getContent())->not->toContain($storedHash, 'Password123!');
    }
});

it('stores new and changed passwords as hashes', function () {
    $user = User::factory()->create(['password' => 'InitialPassword123!']);

    expect($user->fresh()->getRawOriginal('password'))->not->toBe('InitialPassword123!');
    expect(Hash::check('InitialPassword123!', $user->fresh()->password))->toBeTrue();

    $user->password = 'ChangedPassword123!';
    $user->save();

    expect(Hash::check('ChangedPassword123!', $user->fresh()->password))->toBeTrue();
    expect(Hash::check('InitialPassword123!', $user->fresh()->password))->toBeFalse();
});

it('sets a browser-readable CSRF cookie and an HttpOnly session cookie', function () {
    $response = $this->startCookieSession();
    $cookies = collect($response->baseResponse->headers->getCookies())->keyBy(fn ($cookie) => $cookie->getName());

    expect($cookies['XSRF-TOKEN']->isHttpOnly())->toBeFalse();
    expect($cookies[config('session.cookie')]->isHttpOnly())->toBeTrue();
    expect($cookies[config('session.cookie')]->getSameSite())->toBe('lax');
});

it('rejects login when the real CSRF token is missing or invalid', function (?string $token) {
    $user = User::factory()->create();
    $this->startCookieSession();
    $headers = $token === null ? [] : ['X-XSRF-TOKEN' => $token];

    $this->browserRequest('POST', '/api/login', [
        'email' => $user->email,
        'password' => 'Password123!',
    ], csrf: false, headers: $headers)
        ->assertStatus(419)
        ->assertJsonStructure(['message']);

    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
})->with(['missing' => [null], 'invalid' => ['forged-csrf-token']]);

it('rejects logout without valid CSRF while preserving the authenticated session', function (?string $token) {
    $user = User::factory()->create();
    $this->loginWithCookies($user)->assertOk();
    $headers = $token === null ? [] : ['X-XSRF-TOKEN' => $token];

    $this->browserRequest('POST', '/api/logout', csrf: false, headers: $headers)
        ->assertStatus(419)
        ->assertJsonStructure(['message']);

    $this->browserRequest('GET', '/api/me')->assertOk();
    $this->browserRequest('POST', '/api/logout')->assertNoContent();
})->with(['missing' => [null], 'invalid' => ['forged-csrf-token']]);

it('enforces every role pairing using the role stored on the authenticated account', function (string $actual, string $required) {
    $user = User::factory()->create(['role' => UserRole::from($actual)]);
    $this->loginWithCookies($user)->assertOk();

    $response = $this->browserRequest('GET', '/_tests/roles/'.$required);
    $response->assertStatus($actual === $required ? 200 : 403);

    if ($actual !== $required) {
        $response->assertJsonStructure(['message']);
    }
})->with('role authorization matrix');

it('rejects anonymous access to each role-restricted route', function (string $role) {
    $this->browserRequest('GET', '/_tests/roles/'.$role)->assertUnauthorized();
})->with('account roles');

it('ignores forged roles in credentials, query parameters and headers', function () {
    $user = User::factory()->create(['role' => UserRole::INSTITUTION]);

    $this->loginWithCookies($user, ['role' => 'ADMIN', 'is_active' => true])
        ->assertOk()
        ->assertJsonPath('user.role', 'INSTITUTION');

    $this->browserRequest('GET', '/_tests/roles/ADMIN?role=ADMIN', ['role' => 'ADMIN'], headers: ['X-Role' => 'ADMIN'])
        ->assertForbidden();
    $this->browserRequest('GET', '/_tests/roles/INSTITUTION')->assertOk();

    expect($user->fresh()->role)->toBe(UserRole::INSTITUTION);
});

it('denies a restricted route immediately after the persisted role changes', function () {
    $user = User::factory()->create(['role' => UserRole::ADMIN]);
    $this->loginWithCookies($user)->assertOk();
    $this->browserRequest('GET', '/_tests/roles/ADMIN')->assertOk();

    $user->update(['role' => UserRole::COMPANY]);

    $this->browserRequest('GET', '/_tests/roles/ADMIN')->assertForbidden();
    $this->browserRequest('GET', '/_tests/roles/COMPANY')->assertOk();
});

it('throttles repeated login attempts for the normalized email and IP', function () {
    $user = User::factory()->create(['email' => 'person@example.test']);
    $this->startCookieSession();

    for ($attempt = 0; $attempt < 5; $attempt++) {
        $this->browserRequest('POST', '/api/login', [
            'email' => $attempt % 2 === 0 ? 'person@example.test' : 'PERSON@example.test',
            'password' => 'wrong-password',
        ])->assertUnprocessable();
    }

    $this->browserRequest('POST', '/api/login', [
        'email' => $user->email,
        'password' => 'Password123!',
    ])->assertTooManyRequests()
        ->assertHeader('Retry-After')
        ->assertJsonStructure(['message']);

    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
});

it('limits attempts from one IP even when each email address changes', function () {
    $this->startCookieSession();

    for ($attempt = 0; $attempt < 20; $attempt++) {
        $this->browserRequest('POST', '/api/login', [
            'email' => 'unknown-'.$attempt.'@example.test',
            'password' => 'wrong-password',
        ])->assertUnprocessable();
    }

    $this->browserRequest('POST', '/api/login', [
        'email' => 'another@example.test',
        'password' => 'wrong-password',
    ])->assertTooManyRequests()->assertHeader('Retry-After');
});

it('keeps CSRF protection on login without Origin or Referer headers', function () {
    $user = User::factory()->create();
    $this->startCookieSession();

    $this->browserRequest('POST', '/api/login', [
        'email' => $user->email,
        'password' => 'Password123!',
    ], csrf: false, headers: ['Origin' => '', 'Referer' => ''])
        ->assertStatus(419)
        ->assertJsonStructure(['message']);

    $this->browserRequest('GET', '/api/me')->assertUnauthorized();
});

it('does not authenticate a cookie outside the configured SPA origins', function (string $origin, string $referer) {
    $user = User::factory()->create();
    $this->loginWithCookies($user)->assertOk();

    $this->browserRequest('GET', '/api/me', headers: [
        'Origin' => $origin,
        'Referer' => $referer,
    ])->assertUnauthorized();

    $this->browserRequest('GET', '/api/me')->assertOk();
})->with([
    'untrusted origin' => ['https://untrusted.example', 'https://untrusted.example/'],
    'no origin metadata' => ['', ''],
]);

it('normalizes emails when storing accounts and authenticating', function () {
    $user = User::factory()->create(['email' => '  PERSON@example.test  ']);
    expect($user->fresh()->email)->toBe('person@example.test');

    $this->loginWithCookies($user, ['email' => '  PERSON@EXAMPLE.TEST  '])
        ->assertOk()
        ->assertJsonPath('user.email', 'person@example.test');
});

it('returns JSON 401 without redirecting clients that do not request JSON', function (string $accept) {
    $this->browserRequest('GET', '/api/me', headers: ['Accept' => $accept])
        ->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json')
        ->assertHeaderMissing('Location')
        ->assertExactJson(['message' => 'No autenticado.']);

    $this->startCookieSession();
    $this->browserRequest('POST', '/api/logout', headers: ['Accept' => $accept])
        ->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json')
        ->assertHeaderMissing('Location');
})->with(['no accept' => [''], 'wildcard' => ['*/*'], 'html' => ['text/html']]);
