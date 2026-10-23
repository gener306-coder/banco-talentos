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

// HU-S4-01: cuentas de la Secretaría de Economía.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

function secretaryPayload(array $overrides = []): array
{
    return array_replace(['name' => 'Analista de la Secretaría', 'email' => 'analista@economia.test'], $overrides);
}

function signInAs(UserRole $role, $test): User
{
    $user = User::factory()->role($role)->create();
    $test->loginWithCookies($user)->assertOk();

    return $user;
}

dataset('secretary account managers', [
    'admin' => [UserRole::ADMIN],
    'secretary' => [UserRole::SECRETARY],
]);

it('creates a pending SECRETARY account with the setup link sent by email (CA-01, CA-03)', function (UserRole $role) {
    Notification::fake();
    $creator = signInAs($role, $this);

    $response = $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload(['email' => '  Analista@Economia.TEST ']))
        ->assertCreated()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('setup_delivery', 'sent')
        ->assertJsonMissingPath('setup_url')
        ->assertJsonPath('data.name', 'Analista de la Secretaría')
        ->assertJsonPath('data.email', 'analista@economia.test')
        ->assertJsonPath('data.status', 'pending')
        ->assertJsonMissingPath('data.password');

    $account = User::findOrFail($response->json('data.id'));
    expect($account->role)->toBe(UserRole::SECRETARY)
        ->and($account->password_setup_required)->toBeTrue()
        ->and($account->is_active)->toBeTrue()
        ->and($account->institution_id)->toBeNull()
        ->and($account->created_by)->toBe($creator->id);
    expect($response->getContent())->not->toContain($account->password);

    Notification::assertSentTo($account, SetInitialPassword::class);
    $query = sentSetupLinkQuery($account);
    expect($query['email'])->toBe('analista@economia.test');
})->with('secretary account managers');

it('ignores fields that try to choose another role, institution or creator (CA-01)', function () {
    Notification::fake();
    $creator = signInAs(UserRole::SECRETARY, $this);
    $institution = Institution::factory()->create();
    $other = User::factory()->role(UserRole::ADMIN)->create();

    $response = $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload([
        'role' => 'ADMIN', 'institution_id' => $institution->id, 'company_id' => 1, 'created_by' => $other->id,
        'is_active' => false, 'password' => 'Password123!', 'password_setup_required' => false,
    ]))->assertCreated();

    $account = User::findOrFail($response->json('data.id'));
    expect($account->role)->toBe(UserRole::SECRETARY)
        ->and($account->institution_id)->toBeNull()
        ->and($account->created_by)->toBe($creator->id)
        ->and($account->is_active)->toBeTrue()
        ->and($account->password_setup_required)->toBeTrue()
        ->and(Hash::check('Password123!', $account->password))->toBeFalse();
});

it('returns a manual single-use link and audits who generated it without the token (CA-03, CA-06)', function () {
    Notification::fake();
    Log::spy();
    $creator = signInAs(UserRole::SECRETARY, $this);

    $response = $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload(['delivery_method' => 'manual']))
        ->assertCreated()
        ->assertJsonPath('setup_delivery', 'manual');

    $account = User::findOrFail($response->json('data.id'));
    parse_str(parse_url($response->json('setup_url'), PHP_URL_QUERY), $query);
    $stored = DB::table('institution_password_setup_tokens')->where('email', $account->email)->value('token');
    expect(Hash::check($query['token'], $stored))->toBeTrue();
    Notification::assertNothingSent();
    Log::shouldHaveReceived('notice')->once()->withArgs(fn (string $message, array $context): bool => $message === 'Enlace de configuración inicial generado para entrega manual.'
        && $context === ['issued_by' => $creator->id, 'user_id' => $account->id]);
});

it('lets the new SECRETARY set the password with the link, sign in and create a colleague', function () {
    Notification::fake();
    signInAs(UserRole::ADMIN, $this);
    $account = User::findOrFail($this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload())->assertCreated()->json('data.id'));
    $query = sentSetupLinkQuery($account);
    $this->browserRequest('POST', '/api/logout')->assertNoContent();

    // Antes de establecer la contraseña no puede entrar.
    $this->startCookieSession();
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', [
        'email' => $query['email'], 'token' => $query['token'],
        'password' => 'SecretaryPassword123!', 'password_confirmation' => 'SecretaryPassword123!',
    ])->assertNoContent();
    expect($account->fresh()->password_setup_required)->toBeFalse();

    $this->loginWithCookies($account, ['password' => 'SecretaryPassword123!'])->assertOk()->assertJsonPath('user.role', 'SECRETARY');
    $this->browserRequest('GET', '/api/secretary-accounts')->assertOk()->assertJsonPath('data.0.status', 'active');
    $colleague = $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload(['email' => 'colega@economia.test']))
        ->assertCreated()->json('data.id');
    expect(User::find($colleague)->created_by)->toBe($account->id);
});

it('rejects a duplicated access email anywhere in the system (CA-07)', function (string $email) {
    signInAs(UserRole::SECRETARY, $this);
    User::factory()->forInstitution(Institution::factory()->create())->create(['email' => 'ocupado@economia.test']);

    $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload(['email' => $email]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email' => 'El correo electrónico ya está registrado.']);
    expect(User::where('role', UserRole::SECRETARY)->count())->toBe(1);
})->with(['ocupado@economia.test', ' OCUPADO@economia.test ']);

it('validates the account data without writing it', function (array $overrides, string $field) {
    signInAs(UserRole::ADMIN, $this);

    $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload($overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(User::where('role', UserRole::SECRETARY)->exists())->toBeFalse();
})->with([
    'missing name' => [['name' => null], 'name'],
    'long name' => [['name' => str_repeat('n', 121)], 'name'],
    'missing email' => [['email' => null], 'email'],
    'invalid email' => [['email' => 'no-es-correo'], 'email'],
    'array email' => [['email' => ['x@y.test']], 'email'],
    'unknown delivery' => [['delivery_method' => 'sms'], 'delivery_method'],
]);

it('lists SECRETARY accounts with name, email, status and creation date only (CA-05)', function (UserRole $role) {
    $viewer = signInAs($role, $this);
    User::factory()->role(UserRole::SECRETARY)->create(['name' => 'Beatriz Pendiente', 'email' => 'b@economia.test', 'password_setup_required' => true]);
    User::factory()->role(UserRole::SECRETARY)->create(['name' => 'Carlos Inactivo', 'email' => 'c@economia.test', 'is_active' => false]);
    User::factory()->role(UserRole::SECRETARY)->create(['name' => 'Ana Activa', 'email' => 'a@economia.test']);
    User::factory()->role(UserRole::COMPANY)->create(['name' => 'Empresa']);
    User::factory()->forInstitution(Institution::factory()->create())->create(['name' => 'Institución']);

    $response = $this->browserRequest('GET', '/api/secretary-accounts')
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('meta.current_page', 1);

    $expected = collect([
        ['Ana Activa', 'active'], ['Beatriz Pendiente', 'pending'], ['Carlos Inactivo', 'inactive'],
    ]);
    if ($role === UserRole::SECRETARY) {
        $expected->push([$viewer->name, 'active']);
    }
    $rows = collect($response->json('data'));
    expect($rows->map(fn (array $row) => [$row['name'], $row['status']])->sortBy(0)->values()->all())
        ->toBe($expected->sortBy(0)->values()->all());
    foreach ($rows as $row) {
        expect(array_keys($row))->toBe(['id', 'name', 'email', 'status', 'created_at']);
    }
})->with('secretary account managers');

it('resends the setup link of a pending SECRETARY account and invalidates the previous one (CA-04)', function (UserRole $role) {
    Notification::fake();
    signInAs($role, $this);
    $account = User::findOrFail($this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload())->json('data.id'));
    $first = sentSetupLinkQuery($account);
    $this->travel(61)->seconds();

    $this->browserRequest('POST', '/api/secretary-accounts/resend-setup', ['email' => ' ANALISTA@economia.test', 'delivery_method' => 'manual'])
        ->assertOk()
        ->assertJsonPath('setup_delivery', 'manual');

    $this->browserRequest('POST', '/api/logout')->assertNoContent();
    $this->startCookieSession();
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', [
        'email' => $first['email'], 'token' => $first['token'],
        'password' => 'SecretaryPassword123!', 'password_confirmation' => 'SecretaryPassword123!',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');
})->with('secretary account managers');

it('waits a minute between two resends of the same account (CA-04)', function () {
    Notification::fake();
    signInAs(UserRole::SECRETARY, $this);
    $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload())->assertCreated();

    $this->browserRequest('POST', '/api/secretary-accounts/resend-setup', ['email' => 'analista@economia.test'])
        ->assertStatus(429);
});

it('only resends links of active SECRETARY accounts still pending their first password', function (Closure $make) {
    signInAs(UserRole::ADMIN, $this);
    $account = $make();

    $this->browserRequest('POST', '/api/secretary-accounts/resend-setup', ['email' => $account->email])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email' => 'No hay una cuenta de la Secretaría activa pendiente de configuración con ese correo.']);
    expect(DB::table('institution_password_setup_tokens')->where('email', $account->email)->exists())->toBeFalse();
})->with([
    'already configured' => [fn () => User::factory()->role(UserRole::SECRETARY)->create()],
    'inactive' => [fn () => User::factory()->role(UserRole::SECRETARY)->create(['is_active' => false, 'password_setup_required' => true])],
    'institution account' => [fn () => User::factory()->forInstitution(Institution::factory()->create())->create(['password_setup_required' => true])],
    'admin account' => [fn () => User::factory()->role(UserRole::ADMIN)->create(['password_setup_required' => true])],
    'unknown' => [fn () => new User(['email' => 'nadie@economia.test'])],
]);

it('does not let SECRETARY manage institutions or institutional accounts (CA-02)', function (string $method, string $uri) {
    signInAs(UserRole::SECRETARY, $this);
    $institution = Institution::factory()->create();
    $users = User::count();

    $this->browserRequest($method, str_replace('{id}', (string) $institution->id, $uri), [
        'name' => 'Intento', 'email' => 'intento@economia.test', 'institution_id' => $institution->id, 'cct' => '28XXX0001X', 'contact_email' => 'x@y.test',
    ])->assertForbidden();

    expect(User::count())->toBe($users);
})->with([
    'create institutional account' => ['POST', '/api/institution-accounts'],
    'resend institutional link' => ['POST', '/api/institution-accounts/resend-setup'],
    'start institutional reset' => ['POST', '/api/institution-accounts/password-reset/start'],
    'list institutions' => ['GET', '/api/institutions'],
    'create institution' => ['POST', '/api/institutions'],
    'edit institution' => ['PUT', '/api/institutions/{id}'],
]);

it('forbids SECRETARY accounts management to other roles and anonymous visitors', function (UserRole $role) {
    $role === UserRole::INSTITUTION
        ? $this->loginWithCookies(User::factory()->forInstitution(Institution::factory()->create())->create())->assertOk()
        : signInAs($role, $this);

    $this->browserRequest('GET', '/api/secretary-accounts')->assertForbidden();
    $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload())->assertForbidden();
    $this->browserRequest('POST', '/api/secretary-accounts/resend-setup', ['email' => 'x@economia.test'])->assertForbidden();
    expect(User::where('role', UserRole::SECRETARY)->exists())->toBeFalse();
})->with([UserRole::INSTITUTION, UserRole::COMPANY]);

it('rejects anonymous requests and requires CSRF to create an account', function () {
    $this->browserRequest('GET', '/api/secretary-accounts')->assertUnauthorized();

    signInAs(UserRole::ADMIN, $this);
    $this->browserRequest('POST', '/api/secretary-accounts', secretaryPayload(), csrf: false)->assertStatus(419);
    expect(User::where('role', UserRole::SECRETARY)->exists())->toBeFalse();
});

it('records who created institutional accounts as well', function () {
    Notification::fake();
    $admin = signInAs(UserRole::ADMIN, $this);
    $institution = Institution::factory()->create();

    $id = $this->browserRequest('POST', '/api/institution-accounts', [
        'name' => 'Coordinación', 'email' => 'coordinacion@instituto.test', 'institution_id' => $institution->id,
    ])->assertCreated()->json('data.id');

    expect(User::find($id)->created_by)->toBe($admin->id);
});
