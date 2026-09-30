<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

function accountPayload(array $overrides = []): array
{
    return array_replace([
        'name' => 'Admin Institucional',
        'email' => 'admin@instituto.test',
        'password' => 'Password123!',
        'institution_id' => null, // Deberá proveerse en cada test
    ], $overrides);
}

dataset('unauthorized roles', [
    'institution' => [UserRole::INSTITUTION],
    'company' => [UserRole::COMPANY],
    'secretary' => [UserRole::SECRETARY],
]);

it('allows an admin to create an institutional account linked to an active institution', function () {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $payload = accountPayload(['institution_id' => $institution->id]);

    $response = $this->browserRequest('POST', '/api/institution-accounts', $payload)
        ->assertCreated()
        ->assertJsonPath('data.name', 'Admin Institucional')
        ->assertJsonPath('data.email', 'admin@instituto.test')
        ->assertJsonPath('data.role', UserRole::INSTITUTION->value)
        ->assertJsonPath('data.is_active', true)
        ->assertJsonPath('data.institution.id', $institution->id)
        ->assertJsonPath('data.institution.name', $institution->name);

    $this->assertDatabaseHas('users', [
        'id' => $response->json('data.id'),
        'email' => 'admin@instituto.test',
        'role' => UserRole::INSTITUTION,
        'institution_id' => $institution->id,
        'is_active' => true,
    ]);
});

it('rejects account creation if the institution is inactive', function () {
    $institution = Institution::factory()->inactive()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('institution_id');
});

it('rejects account creation if the institution does not exist', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => 999999]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('institution_id');
});

it('forces the role to INSTITUTION regardless of the payload', function () {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $payload = accountPayload([
        'institution_id' => $institution->id,
        'role' => UserRole::ADMIN->value, // Intento malicioso
    ]);

    $response = $this->browserRequest('POST', '/api/institution-accounts', $payload)
        ->assertCreated()
        ->assertJsonPath('data.role', UserRole::INSTITUTION->value);

    $this->assertDatabaseHas('users', [
        'id' => $response->json('data.id'),
        'role' => UserRole::INSTITUTION,
    ]);
});

it('hashes the password and allows the new user to authenticate', function () {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $payload = accountPayload(['institution_id' => $institution->id]);
    $response = $this->browserRequest('POST', '/api/institution-accounts', $payload)->assertCreated();

    $user = User::find($response->json('data.id'));
    
    // Verificamos CA-06
    expect(Hash::check('Password123!', $user->password))->toBeTrue();
    expect($user->password)->not->toBe('Password123!');

    // Verificamos CA-07 (logout del admin e intento de login del nuevo usuario)
    $this->browserRequest('POST', '/api/logout')->assertNoContent();
    $this->loginWithCookies($user, ['password' => 'Password123!'])->assertOk();
});

it('returns the user role and institution on the /me endpoint', function () {
    $institution = Institution::factory()->create();
    $user = User::factory()->forInstitution($institution)->create();

    $this->loginWithCookies($user)->assertOk();

    // Verificamos CA-08
    $this->browserRequest('GET', '/api/me')
        ->assertOk()
        ->assertJsonPath('user.role', UserRole::INSTITUTION->value)
        ->assertJsonPath('user.institution.id', $institution->id)
        ->assertJsonPath('user.institution.name', $institution->name);
});

it('prevents duplicate emails via uniqueness validation', function () {
    $institution = Institution::factory()->create();
    User::factory()->create(['email' => 'duplicate@example.test']);

    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload([
        'institution_id' => $institution->id,
        'email' => 'duplicate@example.test',
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('rejects account creation from non-admin roles', function (UserRole $role) {
    $institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();

    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
        ->assertForbidden();
})->with('unauthorized roles');

it('rejects access to administrative endpoints for institutional accounts', function () {
    $institution = Institution::factory()->create();
    $user = User::factory()->forInstitution($institution)->create();
    $this->loginWithCookies($user)->assertOk();

    // Verificamos CA-09 y CA-10
    $this->browserRequest('GET', '/api/institutions')
        ->assertForbidden();
        
    $this->browserRequest('POST', '/api/institution-accounts', accountPayload(['institution_id' => $institution->id]))
        ->assertForbidden();
});
