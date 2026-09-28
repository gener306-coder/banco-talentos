<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

it('refuses local account provisioning outside the local environment', function () {
    $this->artisan('auth:create-user')->assertFailed();

    $this->assertDatabaseCount('users', 0);
});

it('refuses non-interactive account provisioning even in the local environment', function () {
    $this->app->detectEnvironment(fn () => 'local');

    $this->artisan('auth:create-user', ['--no-interaction' => true])->assertFailed();

    $this->assertDatabaseCount('users', 0);
});

it('provisions a local account only with an explicit role, status and confirmed password', function (string $answer, bool $active) {
    $this->app->detectEnvironment(fn () => 'local');

    $this->artisan('auth:create-user')
        ->expectsQuestion('Nombre', 'Cuenta local de prueba')
        ->expectsQuestion('Correo electrónico', '  LOCAL@example.test  ')
        ->expectsQuestion('Rol (ADMIN, INSTITUTION, COMPANY, SECRETARY)', 'COMPANY')
        ->expectsQuestion('¿La cuenta estará activa? (sí/no)', $answer)
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', 'ProvisionedPassword123!')
        ->expectsQuestion('Confirma la contraseña', 'ProvisionedPassword123!')
        ->assertSuccessful();

    $this->assertDatabaseCount('users', 1);
    $user = User::sole();

    expect($user->email)->toBe('local@example.test');
    expect($user->role)->toBe(UserRole::COMPANY);
    expect($user->is_active)->toBe($active);
    expect(Hash::check('ProvisionedPassword123!', $user->password))->toBeTrue();
})->with(['active' => ['sí', true], 'inactive' => ['no', false]]);

it('does not invent a role or active status when provisioning answers are omitted', function (string $role, string $active) {
    $this->app->detectEnvironment(fn () => 'local');

    $this->artisan('auth:create-user')
        ->expectsQuestion('Nombre', 'Cuenta local de prueba')
        ->expectsQuestion('Correo electrónico', 'local@example.test')
        ->expectsQuestion('Rol (ADMIN, INSTITUTION, COMPANY, SECRETARY)', $role)
        ->expectsQuestion('¿La cuenta estará activa? (sí/no)', $active)
        ->expectsQuestion('Contraseña (mínimo 12 caracteres)', 'ProvisionedPassword123!')
        ->expectsQuestion('Confirma la contraseña', 'ProvisionedPassword123!')
        ->assertFailed();

    $this->assertDatabaseCount('users', 0);
})->with([
    'missing role' => ['', 'sí'],
    'missing status' => ['COMPANY', ''],
    'student is not an account role' => ['STUDENT', 'sí'],
]);
