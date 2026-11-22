<?php

use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// HU-S16-01: arranque seguro del primer Administrador desde la consola (D1, D3).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    Notification::fake();
});

it('crea el primer Administrador pendiente de configurar y le envía el enlace por correo (CA-01, CA-02)', function () {
    $this->artisan('admin:bootstrap', ['email' => '  Direccion@Example.TEST ', '--name' => 'Dirección General'])
        ->expectsOutputToContain('Administrador creado: direccion@example.test')
        ->assertSuccessful();

    $admin = User::query()->where('email', 'direccion@example.test')->firstOrFail();
    expect($admin->role)->toBe(UserRole::ADMIN)
        ->and($admin->is_active)->toBeTrue()
        ->and($admin->password_setup_required)->toBeTrue()
        ->and($admin->name)->toBe('Dirección General')
        ->and($admin->created_by)->toBeNull();
    Notification::assertSentTo($admin, SetInitialPassword::class, fn (SetInitialPassword $notification) => str_contains($notification->setupUrl, '/set-initial-password?'));
});

it('sin nombre usa el correo como nombre provisional (M3)', function () {
    $this->artisan('admin:bootstrap', ['email' => 'operacion@example.test'])->assertSuccessful();

    expect(User::query()->where('email', 'operacion@example.test')->value('name'))->toBe('operacion@example.test');
});

it('se niega si ya existe un Administrador activo (CA-01)', function () {
    User::factory()->role(UserRole::ADMIN)->create();

    $this->artisan('admin:bootstrap', ['email' => 'otro@example.test'])
        ->expectsOutputToContain('Ya existe un Administrador activo')
        ->assertFailed();

    expect(User::query()->where('email', 'otro@example.test')->exists())->toBeFalse();
    Notification::assertNothingSent();
});

it('permite el arranque si el único Administrador existente está inactivo', function () {
    User::factory()->role(UserRole::ADMIN)->create(['is_active' => false]);

    $this->artisan('admin:bootstrap', ['email' => 'nuevo@example.test'])->assertSuccessful();
});

it('rechaza un correo inválido o ya registrado sin crear nada', function () {
    User::factory()->role(UserRole::SECRETARY)->create(['email' => 'ocupado@example.test']);

    $this->artisan('admin:bootstrap', ['email' => 'no-es-correo'])->expectsOutputToContain('no es válido')->assertFailed();
    $this->artisan('admin:bootstrap', ['email' => 'ocupado@example.test'])->expectsOutputToContain('ya está registrado')->assertFailed();

    expect(User::query()->where('role', UserRole::ADMIN)->count())->toBe(0);
});

it('con --manual imprime el enlace una sola vez y nunca lo escribe en los logs (CA-02)', function () {
    Log::spy();

    $this->artisan('admin:bootstrap', ['email' => 'manual@example.test', '--manual' => true])
        ->expectsOutputToContain('/set-initial-password?')
        ->assertSuccessful();

    Notification::assertNothingSent();
    Log::shouldHaveReceived('notice')->withArgs(function (string $message, array $context): bool {
        $flat = json_encode($context);

        return ! str_contains($flat, 'token') && ! str_contains($flat, 'set-initial-password') && $context['delivery'] === 'manual';
    });
});

it('corre sin interacción en producción (CA-01)', function () {
    $this->app['env'] = 'production';

    $this->artisan('admin:bootstrap', ['email' => 'prod@example.test', '--no-interaction' => true])->assertSuccessful();

    expect(User::query()->where('email', 'prod@example.test')->exists())->toBeTrue();
});

it('el enlace sirve para establecer la contraseña del Administrador e iniciar sesión', function () {
    $this->artisan('admin:bootstrap', ['email' => 'inicio@example.test'])->assertSuccessful();
    $admin = User::query()->where('email', 'inicio@example.test')->firstOrFail();
    $query = sentSetupLinkQuery($admin);

    $this->initializeCookieBrowser();
    $this->startCookieSession();
    $this->browserRequest('POST', '/api/institution-accounts/password-setup', [
        'email' => $query['email'], 'token' => $query['token'],
        'password' => 'Contraseña-Segura-2026', 'password_confirmation' => 'Contraseña-Segura-2026',
    ])->assertNoContent();

    expect($admin->fresh()->password_setup_required)->toBeFalse();
    $this->loginWithCookies($admin->fresh(), ['password' => 'Contraseña-Segura-2026'])->assertOk()->assertJsonPath('user.role', 'ADMIN');
});

it('registra admin_bootstrapped como evento de la consola, sin cuenta como actor (CA-03, D3)', function () {
    $this->artisan('admin:bootstrap', ['email' => 'bitacora@example.test'])->assertSuccessful();
    $admin = User::query()->where('email', 'bitacora@example.test')->firstOrFail();

    $event = AccountAuditEvent::query()->where('event', 'admin_bootstrapped')->sole();
    expect($event->actor_id)->toBeNull()
        ->and($event->actor_kind)->toBe('cli')
        ->and($event->subject_type)->toBe('user')
        ->and($event->subject_id)->toBe($admin->id);
});

it('la base de datos exige actor en los eventos de la interfaz y lo prohíbe en los de la consola (D3)', function () {
    $user = User::factory()->role(UserRole::ADMIN)->create();
    $insert = fn (array $row) => DB::transaction(fn () => DB::table('account_audit_events')->insert([
        'event' => 'account_updated', 'subject_type' => 'user', 'subject_id' => $user->id, 'changed_fields' => '[]', 'created_at' => now(), ...$row,
    ]));

    expect(fn () => $insert(['actor_id' => null, 'actor_kind' => 'user']))->toThrow(QueryException::class)
        ->and(fn () => $insert(['actor_id' => $user->id, 'actor_kind' => 'cli']))->toThrow(QueryException::class);
    $insert(['actor_id' => $user->id, 'actor_kind' => 'user']);
    $insert(['actor_id' => null, 'actor_kind' => 'cli']);
    expect(DB::table('account_audit_events')->count())->toBe(2);
});

it('la bitácora muestra el evento de la consola con actor nulo', function () {
    $this->artisan('admin:bootstrap', ['email' => 'primero@example.test'])->assertSuccessful();
    $viewer = User::factory()->role(UserRole::ADMIN)->create();

    $this->initializeCookieBrowser();
    $this->loginWithCookies($viewer)->assertOk();
    $this->browserRequest('GET', '/api/audit-events?type=admin_bootstrapped')->assertOk()
        ->assertJsonPath('data.0.type', 'admin_bootstrapped')
        ->assertJsonPath('data.0.actor', null)
        ->assertJsonPath('data.0.resource.subject_type', 'user')
        ->assertJsonPath('data.0.resource.name', 'primero@example.test');
});
