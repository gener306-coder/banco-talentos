<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

function accountPayload(array $overrides = []): array
{
    return array_replace([
        'name' => 'Responsable institucional',
        'email' => 'responsable@instituto.test',
        'institution_id' => null,
    ], $overrides);
}

dataset('institution account unauthorized roles', [
    'institution' => [UserRole::INSTITUTION],
    'company' => [UserRole::COMPANY],
    'secretary' => [UserRole::SECRETARY],
]);

it('creates a pending institutional account without an administrator-provided password', function () {
    Notification::fake();
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $response = $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
    ]))->assertCreated()
        ->assertJsonPath('data.name', 'Responsable institucional')
        ->assertJsonPath('data.email', 'responsable@instituto.test')
        ->assertJsonPath('data.role', UserRole::INSTITUTION->value)
        ->assertJsonPath('data.is_active', true)
        ->assertJsonPath('data.institution.id', $institution->id)
        ->assertJsonPath('data.institution.name', $institution->name)
        ->assertJsonMissingPath('data.password')
        ->assertJsonMissingPath('data.remember_token')
        ->assertJsonMissingPath('data.password_setup_required')
        ->assertJsonPath('setup_delivery', 'sent')
        ->assertJsonMissingPath('setup_url');

    $user = User::findOrFail($response->json('data.id'));
    expect($user->password_setup_required)->toBeTrue();
    expect($user->getHidden())->toContain('password');
    expect($user->toArray())->not->toHaveKeys(['password', 'remember_token']);
    expect(password_get_info($user->password)['algoName'])->toBe('bcrypt');
    expect($response->getContent())->not->toContain($user->password);

    $setupUrl = Notification::sent($user, SetInitialPassword::class)->last()->setupUrl;
    expect(parse_url($setupUrl, PHP_URL_PATH))->toBe('/set-initial-password');
    $query = sentSetupLinkQuery($user);
    expect($query['email'])->toBe($user->email);
    expect($response->getContent())->not->toContain($query['token']);
    expect($query['token'])->toBeString()->not->toBeEmpty();

    $storedToken = DB::table('institution_password_setup_tokens')->where('email', $user->email)->value('token');
    expect($storedToken)->not->toBe($query['token']);
    expect(Hash::check($query['token'], $storedToken))->toBeTrue();
    $this->assertDatabaseCount('users', 2);
    $this->assertDatabaseCount('institution_password_setup_tokens', 1);
    $this->assertDatabaseHas('users', [
        'id' => $user->id,
        'institution_id' => $institution->id,
        'role' => 'INSTITUTION',
        'is_active' => true,
        'password_setup_required' => true,
    ]);
});

it('ignores forged password role state and setup flags at administrative creation', function () {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $response = $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
        'password' => 'AdministratorKnownPassword!',
        'role' => 'ADMIN',
        'is_active' => false,
        'password_setup_required' => false,
        'id' => 99999999,
    ]))->assertCreated()
        ->assertJsonPath('data.role', 'INSTITUTION')
        ->assertJsonPath('data.is_active', true);

    $user = User::findOrFail($response->json('data.id'));
    expect($user->id)->not->toBe(99999999);
    expect($user->password_setup_required)->toBeTrue();
    expect(Hash::check('AdministratorKnownPassword!', $user->password))->toBeFalse();
    expect($response->getContent())->not->toContain('AdministratorKnownPassword!', $user->password);
});

it('rejects inactive or nonexistent institution associations without creating an account or token', function (bool $exists) {
    $institutionId = $exists ? Institution::factory()->inactive()->create()->id : 99999999;
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institutionId]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('institution_id');

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
})->with(['inactive' => [true], 'nonexistent' => [false]]);

it('validates institutional account fields without partial writes', function (array $overrides, array $fields) {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(array_replace([
        'institution_id' => $institution->id,
    ], $overrides)))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($fields);

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
})->with([
    'missing name' => [['name' => null], ['name']],
    'blank name' => [['name' => '   '], ['name']],
    'non-string name' => [['name' => []], ['name']],
    'long name' => [['name' => str_repeat('n', 121)], ['name']],
    'missing email' => [['email' => null], ['email']],
    'invalid email' => [['email' => 'not-an-email'], ['email']],
    'non-string email' => [['email' => []], ['email']],
    'long email' => [['email' => str_repeat('a', 245).'@example.test'], ['email']],
    'missing institution' => [['institution_id' => null], ['institution_id']],
    'non-integer institution' => [['institution_id' => 'invalid'], ['institution_id']],
    'array institution' => [['institution_id' => []], ['institution_id']],
    'unknown delivery method' => [['delivery_method' => 'sms'], ['delivery_method']],
    'blank delivery method' => [['delivery_method' => ''], ['delivery_method']],
    'non-string delivery method' => [['delivery_method' => 123], ['delivery_method']],
    'array delivery method' => [['delivery_method' => ['manual']], ['delivery_method']],
    'uppercase delivery method' => [['delivery_method' => 'MANUAL'], ['delivery_method']],
]);

it('normalizes account emails and rejects duplicates across roles including inactive accounts', function (UserRole $role) {
    $institution = Institution::factory()->create();
    $existing = User::factory()->role($role)->inactive()->create(['email' => 'duplicate@example.test']);
    $original = $existing->fresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
        'email' => '  DUPLICATE@EXAMPLE.TEST  ',
    ]))->assertUnprocessable()->assertJsonValidationErrors('email');

    $this->assertDatabaseCount('users', 2);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
    expect($existing->fresh()->getAttributes())->toBe($original);

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
        'email' => '  NEW@EXAMPLE.TEST  ',
    ]))->assertCreated()->assertJsonPath('data.email', 'new@example.test');
})->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::COMPANY, UserRole::SECRETARY]);

it('rolls back a duplicate email conflict arising after request validation', function () {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $dispatcher = User::getEventDispatcher();
    User::setEventDispatcher(clone $dispatcher);

    try {
        User::creating(function (User $pending): void {
            DB::table('users')->insert($pending->getAttributes());
        });

        $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    } finally {
        User::setEventDispatcher($dispatcher);
    }

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
});

it('rejects anonymous account creation with valid CSRF', function () {
    $institution = Institution::factory()->create();
    $this->startCookieSession();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
        ->assertUnauthorized();

    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
});

it('rejects account creation by every non-admin role even with forged admin claims', function (UserRole $role) {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts?role=ADMIN', accountPayload([
        'institution_id' => $institution->id,
        'role' => 'ADMIN',
    ]), headers: ['X-Role' => 'ADMIN'])->assertForbidden();

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
})->with('institution account unauthorized roles');

it('rejects account creation after the administrator is deactivated', function () {
    $institution = Institution::factory()->create();
    $admin = User::factory()->role(UserRole::ADMIN)->create();
    $this->loginWithCookies($admin)->assertOk();
    $admin->update(['is_active' => false]);

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
        ->assertUnauthorized();

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
});

it('protects administrative creation with real CSRF verification', function (?string $token) {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]),
        csrf: false, headers: $token === null ? [] : ['X-XSRF-TOKEN' => $token])
        ->assertStatus(419);

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
})->with(['missing' => [null], 'invalid' => ['forged-csrf-token']]);

it('returns institutional identity without exposing password hashes or setup credentials', function () {
    $institution = Institution::factory()->create();
    $user = User::factory()->forInstitution($institution)->create();

    foreach ([
        $this->loginWithCookies($user)->assertOk(),
        $this->browserRequest('GET', '/api/me')->assertOk(),
    ] as $response) {
        $response->assertExactJson(['user' => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => 'INSTITUTION',
            'institution' => ['id' => $institution->id, 'name' => $institution->name],
        ]]);
        expect($response->getContent())->not->toContain($user->password, 'Password123!');
    }

    $this->browserRequest('GET', '/api/institutions')->assertForbidden();
    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
        ->assertForbidden();
});

it('delivers the setup link by email without exposing it in JSON in any environment (HU-S2-01 CA-02)', function (string $environment, ?string $method) {
    Notification::fake();
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    // TestCase already verified the isolated PostgreSQL testing database before
    // RefreshDatabase ran. Only exercise the response environment condition.
    $this->app->detectEnvironment(fn () => $environment);

    try {
        Log::spy();
        $payload = accountPayload(['institution_id' => $institution->id]);
        if ($method !== null) {
            $payload['delivery_method'] = $method;
        }
        $response = $this->browserRequest('POST', '/api/institution-accounts', $payload)
            ->assertCreated()
            ->assertJsonPath('setup_delivery', 'sent')
            ->assertJsonMissingPath('setup_url')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.password_setup_required');

        $user = User::findOrFail($response->json('data.id'));
        Notification::assertSentTo($user, SetInitialPassword::class, function (SetInitialPassword $notification, array $channels) use ($response, $user): bool {
            parse_str(parse_url($notification->setupUrl, PHP_URL_QUERY), $query);
            expect($query['email'])->toBe($user->email);
            expect(Hash::check($query['token'], DB::table('institution_password_setup_tokens')->where('email', $user->email)->value('token')))->toBeTrue();
            expect($response->getContent())->not->toContain($query['token'], $user->password);

            return in_array('mail', $channels, true);
        });
        Log::shouldNotHaveReceived('notice');
    } finally {
        $this->app->detectEnvironment(fn () => 'testing');
    }
})->with(['testing', 'local', 'production'])->with(['default' => [null], 'explicit email' => ['email']]);

it('returns the one-time setup link for manual delivery without sending any mail (HU-S2-01 CA-01, CA-03)', function (string $environment) {
    Notification::fake();
    Log::spy();
    $institution = Institution::factory()->create();
    $admin = User::factory()->role(UserRole::ADMIN)->create();
    $this->loginWithCookies($admin)->assertOk();
    $this->app->detectEnvironment(fn () => $environment);

    try {
        $response = $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
            'institution_id' => $institution->id,
            'delivery_method' => 'manual',
        ]))->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('setup_delivery', 'manual')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.delivery_method');

        $user = User::findOrFail($response->json('data.id'));
        expect($user->password_setup_required)->toBeTrue();
        $setupUrl = $response->json('setup_url');
        expect(str_starts_with($setupUrl, rtrim(config('app.frontend_url'), '/').'/set-initial-password?'))->toBeTrue();
        parse_str(parse_url($setupUrl, PHP_URL_QUERY), $query);
        expect($query['email'])->toBe($user->email);
        $stored = DB::table('institution_password_setup_tokens')->where('email', $user->email)->value('token');
        expect($stored)->not->toBe($query['token']);
        expect(Hash::check($query['token'], $stored))->toBeTrue();
        expect($response->getContent())->not->toContain($user->password, $stored);

        Notification::assertNothingSent();
        Log::shouldHaveReceived('notice')->once()->withArgs(function (string $message, array $context) use ($admin, $user, $query): bool {
            return $message === 'Enlace de configuración inicial generado para entrega manual.'
                && $context === ['admin_id' => $admin->id, 'user_id' => $user->id]
                && ! str_contains(json_encode($context), $query['token']);
        });
    } finally {
        $this->app->detectEnvironment(fn () => 'testing');
    }
})->with(['local', 'production']);

it('keeps the manual link single-use and valid for 60 minutes (HU-S2-01 CA-05)', function (bool $expired) {
    Notification::fake();
    Log::spy();
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $response = $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
        'delivery_method' => 'manual',
    ]))->assertCreated();
    parse_str(parse_url($response->json('setup_url'), PHP_URL_QUERY), $query);
    $payload = [...$query, 'password' => 'TitularPassword123!', 'password_confirmation' => 'TitularPassword123!'];

    $this->replaceBrowserCookies([]);
    $this->startCookieSession();
    if ($expired) {
        $this->travel(61)->minutes();
        $this->browserRequest('POST', '/api/institution-accounts/password-setup', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('token');
        expect(User::findOrFail($response->json('data.id'))->password_setup_required)->toBeTrue();

        return;
    }

    $this->browserRequest('POST', '/api/institution-accounts/password-setup', $payload)->assertNoContent();
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', array_replace($payload, [
        'password' => 'OtraContrasena456!', 'password_confirmation' => 'OtraContrasena456!',
    ]))->assertUnprocessable()->assertJsonValidationErrors('token');
    $this->loginWithCookies(User::findOrFail($response->json('data.id')), ['password' => 'TitularPassword123!'])->assertOk();
})->with(['single use' => [false], 'expired' => [true]]);

it('never returns a manual link to non-admin roles', function (UserRole $role) {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();

    $response = $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
        'delivery_method' => 'manual',
    ]))->assertForbidden()->assertJsonMissingPath('setup_url');

    expect($response->getContent())->not->toContain('set-initial-password');
    $this->assertDatabaseCount('institution_password_setup_tokens', 0);
})->with('institution account unauthorized roles');
