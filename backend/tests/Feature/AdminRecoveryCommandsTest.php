<?php

use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\User;
use App\Notifications\AccessEmailChanged;
use App\Notifications\ResetInstitutionPassword;
use App\Notifications\SetInitialPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

// HU-S16-04: recuperación de emergencia de cuentas ADMIN desde la consola del servidor (D3, D4).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    Notification::fake();
    $this->admin = User::factory()->role(UserRole::ADMIN)->create(['email' => 'direccion@example.test', 'name' => 'Dirección General']);
});

/** Una sesión abierta de la cuenta, como la deja el inicio de sesión. */
function openSession(User $user): string
{
    $id = bin2hex(random_bytes(20));
    DB::table('sessions')->insert(['id' => $id, 'user_id' => $user->id, 'payload' => '', 'last_activity' => now()->timestamp]);

    return $id;
}

describe('admin:list (CA-01)', function () {
    it('lista las cuentas de Administración con su estado, sin contraseñas ni tokens', function () {
        User::factory()->role(UserRole::ADMIN)->create(['email' => 'inactiva@example.test', 'is_active' => false]);
        User::factory()->role(UserRole::SECRETARY)->create(['email' => 'secretaria@example.test']);

        expect(Artisan::call('admin:list'))->toBe(0);
        $output = Artisan::output();

        expect($output)->toContain('direccion@example.test')
            ->and($output)->toMatch('/inactiva@example\.test\s*\|\s*Inactiva/')
            ->and($output)->not->toContain('secretaria@example.test')
            ->and($output)->not->toContain('$2y$');
    });

    it('sin Administradores sugiere el arranque', function () {
        $this->admin->forceFill(['role' => UserRole::SECRETARY])->save();

        $this->artisan('admin:list')->expectsOutputToContain('admin:bootstrap')->assertSuccessful();
    });
});

describe('admin:reset-password (CA-02)', function () {
    it('emite el enlace de restablecimiento, cierra todas las sesiones, rota el token y registra el evento de consola', function () {
        $session = openSession($this->admin);
        $other = openSession(User::factory()->role(UserRole::ADMIN)->create());
        $remember = $this->admin->fresh()->getRememberToken();
        Password::broker('institution_setup')->createToken($this->admin);

        $this->artisan('admin:reset-password', ['email' => ' DIRECCION@example.test '])
            ->expectsOutputToContain('Sesiones cerradas y enlace enviado')
            ->assertSuccessful();

        expect(DB::table('sessions')->where('id', $session)->exists())->toBeFalse()
            ->and(DB::table('sessions')->where('id', $other)->exists())->toBeTrue()
            ->and($this->admin->fresh()->getRememberToken())->not->toBe($remember)
            ->and(DB::table('institution_password_setup_tokens')->where('email', $this->admin->email)->exists())->toBeFalse()
            ->and(DB::table('institution_password_reset_tokens')->where('email', $this->admin->email)->exists())->toBeTrue();
        Notification::assertSentTo($this->admin, ResetInstitutionPassword::class,
            fn (ResetInstitutionPassword $notification) => $notification->initiator === ResetInstitutionPassword::CONSOLE_INITIATOR);
        $event = AccountAuditEvent::query()->where('event', 'password_reset_issued')->sole();
        expect($event->actor_kind)->toBe('cli')->and($event->actor_id)->toBeNull()->and($event->subject_id)->toBe($this->admin->id);
    });

    it('el enlace emitido sirve para establecer una contraseña nueva e iniciar sesión con ella', function () {
        $this->artisan('admin:reset-password', ['email' => 'direccion@example.test'])->assertSuccessful();
        $notification = Notification::sent($this->admin, ResetInstitutionPassword::class)->last();
        parse_str(parse_url($notification->resetUrl, PHP_URL_QUERY), $query);

        $this->initializeCookieBrowser();
        $this->startCookieSession();
        $this->browserRequest('POST', '/api/institution-accounts/password-reset', [
            'email' => $query['email'], 'token' => $query['token'],
            'password' => 'Nueva-Contraseña-2026', 'password_confirmation' => 'Nueva-Contraseña-2026',
        ])->assertNoContent();
        $this->loginWithCookies($this->admin->fresh(), ['password' => 'Nueva-Contraseña-2026'])->assertOk();
    });

    it('con --manual imprime el enlace y no lo deja en los logs', function () {
        Log::spy();

        $this->artisan('admin:reset-password', ['email' => 'direccion@example.test', '--manual' => true])
            ->expectsOutputToContain('/reset-password?')
            ->assertSuccessful();

        Log::shouldHaveReceived('notice')->withArgs(fn (string $message, array $context): bool => ! str_contains(json_encode($context), 'token')
            && ! str_contains(json_encode($context), 'reset-password') && $context['delivery'] === 'manual');
    });

    it('a una cuenta pendiente de configurar le emite de nuevo su enlace de configuración', function () {
        $this->admin->forceFill(['password_setup_required' => true])->save();

        $this->artisan('admin:reset-password', ['email' => 'direccion@example.test'])->assertSuccessful();

        Notification::assertSentTo($this->admin, SetInitialPassword::class);
        Notification::assertNotSentTo($this->admin, ResetInstitutionPassword::class);
    });

    it('rechaza cuentas que no son de Administración, inexistentes o inactivas sin tocar nada', function () {
        $secretary = User::factory()->role(UserRole::SECRETARY)->create(['email' => 'secretaria@example.test']);
        $session = openSession($secretary);
        User::factory()->role(UserRole::ADMIN)->create(['email' => 'inactiva@example.test', 'is_active' => false]);

        $this->artisan('admin:reset-password', ['email' => 'secretaria@example.test'])->expectsOutputToContain('No hay una cuenta de Administración')->assertFailed();
        $this->artisan('admin:reset-password', ['email' => 'nadie@example.test'])->assertFailed();
        $this->artisan('admin:reset-password', ['email' => 'inactiva@example.test'])->expectsOutputToContain('está inactiva')->assertFailed();

        expect(DB::table('sessions')->where('id', $session)->exists())->toBeTrue()
            ->and(AccountAuditEvent::query()->count())->toBe(0);
        Notification::assertNothingSent();
    });
});

describe('admin:update-email (CA-03, D4)', function () {
    it('cambia el correo, cierra las sesiones, invalida los enlaces y avisa a ambas direcciones', function () {
        $session = openSession($this->admin);
        Password::broker('institution_reset')->createToken($this->admin);

        $this->artisan('admin:update-email', ['current' => 'direccion@example.test', 'new' => ' Nueva.Direccion@Example.TEST '])
            ->expectsOutputToContain('Correo de acceso actualizado')
            ->assertSuccessful();

        expect($this->admin->fresh()->email)->toBe('nueva.direccion@example.test')
            ->and(DB::table('sessions')->where('id', $session)->exists())->toBeFalse()
            ->and(DB::table('institution_password_reset_tokens')->where('email', 'direccion@example.test')->exists())->toBeFalse();
        Notification::assertSentTo(new AnonymousNotifiable, AccessEmailChanged::class,
            fn (AccessEmailChanged $notification, array $channels, AnonymousNotifiable $notifiable) => $notification->toPreviousAddress
                && $notifiable->routes['mail'] === 'direccion@example.test');
        Notification::assertSentTo($this->admin, AccessEmailChanged::class, fn (AccessEmailChanged $notification) => ! $notification->toPreviousAddress);
    });

    it('registra email_changed de consola con el nombre del campo, sin los valores', function () {
        $this->artisan('admin:update-email', ['current' => 'direccion@example.test', 'new' => 'nueva@example.test'])->assertSuccessful();

        $event = AccountAuditEvent::query()->where('event', 'email_changed')->sole();
        expect($event->actor_kind)->toBe('cli')
            ->and($event->changed_fields)->toBe(['email'])
            ->and(json_encode($event->getAttributes()))->not->toContain('nueva@example.test')->not->toContain('direccion@example.test');
    });

    it('el Administrador entra con el correo nuevo y ya no con el anterior', function () {
        $this->artisan('admin:update-email', ['current' => 'direccion@example.test', 'new' => 'nueva@example.test'])->assertSuccessful();

        $this->initializeCookieBrowser();
        $this->startCookieSession();
        $this->browserRequest('POST', '/api/login', ['email' => 'direccion@example.test', 'password' => 'Password123!'])->assertUnprocessable();
        $this->browserRequest('POST', '/api/login', ['email' => 'nueva@example.test', 'password' => 'Password123!'])->assertOk();
    });

    it('rechaza correos inválidos, ocupados o iguales, y cuentas que no son de Administración (D4)', function () {
        User::factory()->role(UserRole::SECRETARY)->create(['email' => 'secretaria@example.test']);

        $this->artisan('admin:update-email', ['current' => 'direccion@example.test', 'new' => 'no-es-correo'])->expectsOutputToContain('no es válido')->assertFailed();
        $this->artisan('admin:update-email', ['current' => 'direccion@example.test', 'new' => 'secretaria@example.test'])->expectsOutputToContain('ya está registrado')->assertFailed();
        $this->artisan('admin:update-email', ['current' => 'direccion@example.test', 'new' => 'direccion@example.test'])->expectsOutputToContain('igual al actual')->assertFailed();
        $this->artisan('admin:update-email', ['current' => 'secretaria@example.test', 'new' => 'otra@example.test'])->expectsOutputToContain('No hay una cuenta de Administración')->assertFailed();

        expect($this->admin->fresh()->email)->toBe('direccion@example.test')
            ->and(User::query()->where('email', 'secretaria@example.test')->exists())->toBeTrue()
            ->and(AccountAuditEvent::query()->count())->toBe(0);
        Notification::assertNothingSent();
    });
});
