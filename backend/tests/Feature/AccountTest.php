<?php

use App\Enums\UserRole;
use App\Models\AccountAuditEvent;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\PasswordChanged;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support\InteractsWithCookieSessions;

// HU-S14-01: Mi cuenta. Nombre y contraseña de la persona de la sesión, para todos los roles.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual']);
});

const NEW_PASSWORD = 'Contraseña-Nueva-2026';

function changePassword($test, array $data = [])
{
    return $test->browserRequest('PUT', '/api/me/password', array_replace([
        'current_password' => 'Password123!', 'password' => NEW_PASSWORD, 'password_confirmation' => NEW_PASSWORD,
    ], $data));
}

describe('acceso (CA-05)', function () {
    it('rejects visitors and requests without CSRF', function () {
        $this->startCookieSession();
        $this->browserRequest('PATCH', '/api/me', ['name' => 'Otra'])->assertUnauthorized();
        $this->browserRequest('PUT', '/api/me/password', [])->assertUnauthorized();

        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('PATCH', '/api/me', ['name' => 'Otra'], csrf: false)->assertStatus(419);
        $this->browserRequest('PUT', '/api/me/password', [], csrf: false)->assertStatus(419);
    });

    it('lets every role manage its own account', function (UserRole $role) {
        $user = User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('PATCH', '/api/me', ['name' => '  Nombre corregido  '])->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('user.name', 'Nombre corregido')->assertJsonPath('user.email', $user->email);
        expect($user->refresh()->name)->toBe('Nombre corregido');
    })->with([UserRole::ADMIN, UserRole::SECRETARY, UserRole::INSTITUTION, UserRole::COMPANY]);
});

describe('nombre (CA-02)', function () {
    it('only accepts the name: email, role and organization cannot change here', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $other = Institution::factory()->create();

        $this->browserRequest('PATCH', '/api/me', [
            'name' => 'Nuevo', 'email' => 'otro@example.test', 'role' => 'ADMIN', 'institution_id' => $other->id, 'is_active' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'role', 'institution_id', 'is_active']);
        $this->account->refresh();
        expect($this->account->name)->toBe('Coordinación Dual')
            ->and($this->account->role)->toBe(UserRole::INSTITUTION)->and($this->account->institution_id)->toBe($this->institution->id);
    });

    it('validates the name', function (mixed $name, string $message) {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('PATCH', '/api/me', ['name' => $name])->assertUnprocessable()
            ->assertJsonValidationErrors(['name' => $message]);
    })->with([
        'vacío' => ['', 'Escribe tu nombre.'],
        'solo espacios' => ['   ', 'Escribe tu nombre.'],
        'largo' => [str_repeat('a', 121), 'El nombre admite hasta 120 caracteres.'],
        'no texto' => [[1], 'El nombre no es válido.'],
    ]);

    it('records the change in the audit log, and nothing when the name stays the same (CA-06)', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $this->browserRequest('PATCH', '/api/me', ['name' => 'Coordinación Dual'])->assertOk();
        expect(AccountAuditEvent::query()->count())->toBe(0);

        $this->browserRequest('PATCH', '/api/me', ['name' => 'Vinculación UT'])->assertOk();
        $event = AccountAuditEvent::query()->sole();
        expect([$event->actor_id, $event->event, $event->subject_type, $event->subject_id, $event->changed_fields])
            ->toBe([$this->account->id, 'account_updated', 'user', $this->account->id, ['name']]);
        expect(json_encode($event->getAttributes()))->not->toContain('Vinculación UT');
    });
});

describe('contraseña (CA-03, CA-04)', function () {
    it('requires the current password, the policy and a different password', function () {
        $this->loginWithCookies($this->account)->assertOk();

        changePassword($this, ['current_password' => 'Equivocada123!'])->assertUnprocessable()
            ->assertJsonValidationErrors(['current_password' => 'La contraseña actual no es correcta.']);
        changePassword($this, ['password' => 'corta', 'password_confirmation' => 'corta'])->assertUnprocessable()
            ->assertJsonValidationErrors(['password' => 'La contraseña debe tener al menos 12 caracteres.']);
        changePassword($this, ['password_confirmation' => 'Otra-Distinta-2026'])->assertUnprocessable()
            ->assertJsonValidationErrors(['password' => 'Las contraseñas no coinciden.']);
        changePassword($this, ['password' => 'Password123!', 'password_confirmation' => 'Password123!'])->assertUnprocessable()
            ->assertJsonValidationErrors(['password' => 'La contraseña nueva debe ser distinta de la actual.']);
        changePassword($this, ['current_password' => 'Password123!', 'password' => 'Password123!xx', 'password_confirmation' => 'Password123!xx', 'email' => 'x@example.test'])
            ->assertUnprocessable()->assertJsonValidationErrors(['email']);
        expect(Hash::check('Password123!', $this->account->refresh()->password))->toBeTrue();
    });

    it('rejects a new password equal to the current one', function () {
        $this->account->forceFill(['password' => Hash::make('Actual-Larga-2026')])->save();
        $this->loginWithCookies($this->account, ['password' => 'Actual-Larga-2026'])->assertOk();

        changePassword($this, ['current_password' => 'Actual-Larga-2026', 'password' => 'Actual-Larga-2026', 'password_confirmation' => 'Actual-Larga-2026'])
            ->assertUnprocessable()->assertJsonValidationErrors(['password' => 'La contraseña nueva debe ser distinta de la actual.']);
    });

    it('changes the password, keeps this session and closes every other one', function () {
        Notification::fake();
        $this->loginWithCookies($this->account)->assertOk();
        $thisDevice = $this->currentBrowserCookies();

        // Otro dispositivo con su propia sesión y un token de «recordarme».
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->account)->assertOk();
        $otherDevice = $this->currentBrowserCookies();
        $otherSession = $this->currentSessionId();
        $this->account->forceFill(['remember_token' => 'token-anterior'])->save();
        DB::table('institution_password_reset_tokens')->insert(['email' => $this->account->email, 'token' => 'x', 'created_at' => now()]);
        // En producción el manejador de sesiones guarda user_id; el navegador de pruebas reinicia los guards entre peticiones
        // y lo deja vacío, así que se asigna aquí para reproducir las dos sesiones reales de la cuenta.
        DB::table('sessions')->update(['user_id' => $this->account->id]);
        expect(DB::table('sessions')->where('user_id', $this->account->id)->count())->toBe(2);

        $this->replaceBrowserCookies($thisDevice);
        $before = $this->currentSessionId();
        changePassword($this)->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');

        $this->account->refresh();
        expect(Hash::check(NEW_PASSWORD, $this->account->password))->toBeTrue()
            ->and($this->account->remember_token)->not->toBe('token-anterior')->not->toBeNull()
            ->and($this->currentSessionId())->not->toBe($before)
            // La sesión de este dispositivo se regeneró (la anterior ya no existe) y la del otro dispositivo se borró.
            ->and(DB::table('sessions')->whereIn('id', [$before, $otherSession])->exists())->toBeFalse()
            ->and(DB::table('institution_password_reset_tokens')->where('email', $this->account->email)->exists())->toBeFalse();

        // Este dispositivo sigue dentro; el otro quedó fuera.
        $this->browserRequest('GET', '/api/me')->assertOk();
        $this->replaceBrowserCookies($otherDevice);
        $this->browserRequest('GET', '/api/me')->assertUnauthorized();

        Notification::assertSentTo($this->account, PasswordChanged::class, function (PasswordChanged $notice, array $channels) {
            $mail = $notice->toMail($this->account);
            $text = implode(' ', [$mail->subject, ...$mail->introLines, ...$mail->outroLines]);

            return $channels === ['mail'] && ! str_contains($text, NEW_PASSWORD) && $notice instanceof Illuminate\Contracts\Queue\ShouldQueue;
        });
        $event = AccountAuditEvent::query()->sole();
        expect([$event->event, $event->subject_type, $event->changed_fields])->toBe(['password_changed', 'user', []]);
    });

    it('signs in with the new password afterwards', function () {
        $this->loginWithCookies($this->account)->assertOk();
        changePassword($this)->assertNoContent();

        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->account)->assertUnprocessable();
        $this->replaceBrowserCookies([]);
        $this->loginWithCookies($this->account, ['password' => NEW_PASSWORD])->assertOk();
    });

    it('limits password attempts to frustrate guessing the current one', function () {
        RateLimiter::clear('account-password:'.$this->account->id);
        $this->loginWithCookies($this->account)->assertOk();
        foreach (range(1, 5) as $attempt) {
            changePassword($this, ['current_password' => "Equivocada{$attempt}!"])->assertUnprocessable();
        }
        changePassword($this)->assertTooManyRequests();
        expect(Hash::check('Password123!', $this->account->refresh()->password))->toBeTrue();
    });
});

describe('bitácora inmutable (CA-06)', function () {
    it('cannot be edited or deleted, even directly in the database', function () {
        $event = AccountAuditEvent::record($this->account, AccountAuditEvent::ACCOUNT_UPDATED, $this->account, ['name']);

        foreach ([
            fn () => DB::table('account_audit_events')->where('id', $event->id)->update(['event' => 'password_changed']),
            fn () => DB::table('account_audit_events')->where('id', $event->id)->delete(),
        ] as $attempt) {
            expect(fn () => DB::transaction($attempt))->toThrow(QueryException::class, 'Los eventos de la bitácora no se editan ni se borran.');
        }
        expect(fn () => DB::transaction(fn () => DB::table('account_audit_events')->insert([
            'actor_id' => $this->account->id, 'event' => 'otro', 'subject_type' => 'user', 'subject_id' => 1, 'created_at' => now(),
        ])))->toThrow(QueryException::class, 'account_audit_events_event_check');
        expect(fn () => $event->delete())->toThrow(LogicException::class);
        expect(AccountAuditEvent::query()->count())->toBe(1);
    });
});
