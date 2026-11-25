<?php

use App\Enums\UserRole;
use App\Http\Controllers\AdminAccountController;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use App\Notifications\SetInitialPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// HU-S16-02: cuentas de Administración (invitar, inactivar, reactivar y restablecer), con el último ADMIN protegido.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    Notification::fake();
    $this->admin = User::factory()->role(UserRole::ADMIN)->create(['name' => 'Dirección General']);
});

function adminAccountsSignIn($test, ?User $user = null): User
{
    $user ??= $test->admin;
    $test->loginWithCookies($user)->assertOk();

    return $user;
}

describe('invitación y listado (CA-01)', function () {
    it('invita a un ADMIN pendiente con el enlace por correo y registra quién lo creó', function () {
        adminAccountsSignIn($this);

        $this->browserRequest('POST', '/api/admin-accounts', ['name' => 'Operación', 'email' => ' Operacion@Example.TEST '])
            ->assertCreated()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('setup_delivery', 'sent')->assertJsonMissingPath('setup_url')
            ->assertJsonPath('data.email', 'operacion@example.test')->assertJsonPath('data.status', 'pending');

        $invited = User::query()->where('email', 'operacion@example.test')->firstOrFail();
        expect($invited->role)->toBe(UserRole::ADMIN)->and($invited->created_by)->toBe($this->admin->id);
        Notification::assertSentTo($invited, SetInitialPassword::class);
    });

    it('con entrega manual devuelve el enlace de un solo uso', function () {
        adminAccountsSignIn($this);

        $this->browserRequest('POST', '/api/admin-accounts', ['name' => 'Operación', 'email' => 'manual@example.test', 'delivery_method' => 'manual'])
            ->assertCreated()->assertJsonPath('setup_delivery', 'manual')
            ->assertJsonPath('setup_url', fn (string $url) => str_contains($url, '/set-initial-password?'));
        Notification::assertNothingSent();
    });

    it('lista solo cuentas ADMIN, con nombre, correo, estado y alta', function () {
        User::factory()->role(UserRole::SECRETARY)->create(['email' => 'secretaria@example.test']);
        User::factory()->role(UserRole::ADMIN)->create(['name' => 'Ana Inactiva', 'is_active' => false]);
        adminAccountsSignIn($this);

        $response = $this->browserRequest('GET', '/api/admin-accounts')->assertOk()->assertJsonPath('meta.total', 2);
        expect(collect($response->json('data'))->pluck('status')->sort()->values()->all())->toBe(['active', 'inactive'])
            ->and(array_keys($response->json('data.0')))->toEqualCanonicalizing(['id', 'name', 'email', 'status', 'email_verified', 'created_at'])
            ->and($response->getContent())->not->toContain('secretaria@example.test');
    });

    it('reenvía el enlace de un ADMIN pendiente y rechaza el de otro rol', function () {
        $pending = User::factory()->role(UserRole::ADMIN)->create(['email' => 'pendiente@example.test']);
        $pending->forceFill(['password_setup_required' => true])->save();
        User::factory()->role(UserRole::SECRETARY)->create(['email' => 'secretaria@example.test'])->forceFill(['password_setup_required' => true])->save();
        adminAccountsSignIn($this);

        $this->browserRequest('POST', '/api/admin-accounts/resend-setup', ['email' => 'pendiente@example.test'])->assertOk()->assertJsonPath('setup_delivery', 'sent');
        $this->browserRequest('POST', '/api/admin-accounts/resend-setup', ['email' => 'secretaria@example.test'])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', 'No hay una cuenta de Administración activa pendiente de configuración con ese correo.');
    });

    it('el ADMIN invitado establece su contraseña con el enlace e inicia sesión', function () {
        adminAccountsSignIn($this);
        $this->browserRequest('POST', '/api/admin-accounts', ['name' => 'Operación', 'email' => 'nuevo@example.test'])->assertCreated();
        $invited = User::query()->where('email', 'nuevo@example.test')->firstOrFail();
        $query = sentSetupLinkQuery($invited);

        $this->browserRequest('POST', '/api/logout')->assertNoContent();
        $this->startCookieSession();
        $this->browserRequest('POST', '/api/institution-accounts/password-setup', [
            'email' => $query['email'], 'token' => $query['token'], 'password' => 'Contraseña-Admin-2026', 'password_confirmation' => 'Contraseña-Admin-2026',
        ])->assertNoContent();
        $this->loginWithCookies($invited->fresh(), ['password' => 'Contraseña-Admin-2026'])->assertOk()->assertJsonPath('user.role', 'ADMIN');
    });
});

describe('estado (CA-02 a CA-04)', function () {
    it('inactiva y reactiva a otro ADMIN y registra account_status_changed sin datos sensibles (D8)', function () {
        $other = User::factory()->role(UserRole::ADMIN)->create();
        adminAccountsSignIn($this);

        $this->browserRequest('PATCH', "/api/admin-accounts/{$other->id}/status", ['is_active' => false])->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->browserRequest('PATCH', "/api/admin-accounts/{$other->id}/status", ['is_active' => true])->assertOk()->assertJsonPath('data.status', 'active');

        $events = AccountAuditEvent::query()->where('event', 'account_status_changed')->orderBy('id')->get();
        expect($events->pluck('changed_fields')->all())->toBe([['deactivated'], ['activated']])
            ->and($events->pluck('actor_id')->unique()->all())->toBe([$this->admin->id])
            ->and($events->pluck('subject_id')->unique()->all())->toBe([$other->id]);
    });

    it('no registra el evento si el estado no cambia', function () {
        $other = User::factory()->role(UserRole::ADMIN)->create();
        adminAccountsSignIn($this);

        $this->browserRequest('PATCH', "/api/admin-accounts/{$other->id}/status", ['is_active' => true])->assertOk();
        expect(AccountAuditEvent::query()->where('event', 'account_status_changed')->count())->toBe(0);
    });

    it('nadie puede inactivar su propia cuenta (CA-02)', function () {
        User::factory()->role(UserRole::ADMIN)->create();
        adminAccountsSignIn($this);

        $this->browserRequest('PATCH', "/api/admin-accounts/{$this->admin->id}/status", ['is_active' => false])
            ->assertUnprocessable()->assertJsonPath('errors.is_active.0', 'No puedes inactivar tu propia cuenta.');
    });

    it('nunca inactiva al último ADMIN activo (CA-03)', function () {
        // El único ADMIN activo es quien opera: la regla del último Administrador responde antes que la de la cuenta
        // propia. Con dos activos, inactivar al otro sí procede y deja uno.
        adminAccountsSignIn($this);

        $this->browserRequest('PATCH', "/api/admin-accounts/{$this->admin->id}/status", ['is_active' => false])
            ->assertUnprocessable()->assertJsonPath('errors.is_active.0', AdminAccountController::LAST_ADMIN);
        expect($this->admin->fresh()->is_active)->toBeTrue()
            ->and(AccountAuditEvent::query()->where('event', 'account_status_changed')->exists())->toBeFalse();

        $other = User::factory()->role(UserRole::ADMIN)->create();
        $this->browserRequest('PATCH', "/api/admin-accounts/{$other->id}/status", ['is_active' => false])->assertOk();
        expect(User::query()->where('role', 'ADMIN')->where('is_active', true)->pluck('id')->all())->toBe([$this->admin->id]);
    });

    it('bloquea las cuentas ADMIN activas en orden antes de la cuenta elegida y rechaza dejar cero activos', function () {
        $other = User::factory()->role(UserRole::ADMIN)->create();
        adminAccountsSignIn($this);
        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = strtolower($query->sql);
        });

        $this->browserRequest('PATCH', "/api/admin-accounts/{$other->id}/status", ['is_active' => false])->assertOk();

        $lockAll = array_search(true, array_map(fn (string $sql): bool => str_contains($sql, 'from "users"') && str_contains($sql, '"is_active" = ')
            && str_contains($sql, 'order by "id"') && str_contains($sql, 'for update'), $queries), true);
        $lockOne = array_search(true, array_map(fn (string $sql): bool => str_contains($sql, 'from "users"') && str_contains($sql, '"users"."id" = ')
            && str_contains($sql, 'for update'), $queries), true);
        expect($lockAll)->not->toBeFalse()->and($lockOne)->not->toBeFalse()->and($lockAll)->toBeLessThan($lockOne);

        // Dos inactivaciones simultáneas (A inactiva a B y B a A) se serializan en este bloqueo: la segunda ve un solo
        // activo y responde 422 con LAST_ADMIN, como en la prueba anterior.
    });

    it('no cambia el estado de una cuenta pendiente ni de otro rol (404 como inexistente)', function () {
        $pending = User::factory()->role(UserRole::ADMIN)->create();
        $pending->forceFill(['password_setup_required' => true])->save();
        $secretary = User::factory()->role(UserRole::SECRETARY)->create();
        adminAccountsSignIn($this);

        $this->browserRequest('PATCH', "/api/admin-accounts/{$pending->id}/status", ['is_active' => false])->assertUnprocessable();
        $this->browserRequest('PATCH', "/api/admin-accounts/{$secretary->id}/status", ['is_active' => false])->assertNotFound();
        $this->browserRequest('PATCH', '/api/admin-accounts/999999/status', ['is_active' => false])->assertNotFound();
        expect($secretary->fresh()->is_active)->toBeTrue();
    });

    it('el cambio de estado de cuentas de la Secretaría y de empresas también queda en la bitácora (D8)', function () {
        $secretary = User::factory()->role(UserRole::SECRETARY)->create();
        adminAccountsSignIn($this);

        $this->browserRequest('PATCH', "/api/secretary-accounts/{$secretary->id}/status", ['is_active' => false])->assertOk();
        expect(AccountAuditEvent::query()->where('event', 'account_status_changed')->where('subject_id', $secretary->id)->value('changed_fields'))->toBe(['deactivated']);
    });
});

describe('restablecimiento y acceso', function () {
    it('inicia el restablecimiento de otro ADMIN con el aviso de Administración', function () {
        $other = User::factory()->role(UserRole::ADMIN)->create(['email' => 'colega@example.test']);
        adminAccountsSignIn($this);

        $this->browserRequest('POST', '/api/admin-accounts/password-reset/start', ['email' => 'colega@example.test'])->assertOk();
        Notification::assertSentTo($other, ResetInstitutionPassword::class,
            fn (ResetInstitutionPassword $notification) => $notification->initiator === ResetInstitutionPassword::ADMIN_ACCOUNT_INITIATOR);
    });

    it('solo un ADMIN gestiona las cuentas de Administración', function (UserRole $role) {
        $user = $role === UserRole::COMPANY
            ? User::factory()->forCompany(Company::factory()->create())->create()
            : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('GET', '/api/admin-accounts')->assertForbidden();
        $this->browserRequest('POST', '/api/admin-accounts', ['name' => 'X', 'email' => 'x@example.test'])->assertForbidden();
        expect(User::query()->where('email', 'x@example.test')->exists())->toBeFalse();
    })->with([[UserRole::SECRETARY], [UserRole::COMPANY]]);

    it('rechaza visitantes y exige CSRF para invitar', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', '/api/admin-accounts')->assertUnauthorized();

        adminAccountsSignIn($this);
        $this->browserRequest('POST', '/api/admin-accounts', ['name' => 'X', 'email' => 'csrf@example.test'], csrf: false)->assertStatus(419);
    });
});
