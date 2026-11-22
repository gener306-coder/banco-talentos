<?php

use App\Enums\UserRole;
use App\Http\Controllers\PasswordForgotController;
use App\Models\Company;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Support\InteractsWithCookieSessions;

// HU-S16-03: «Olvidé mi contraseña» de autoservicio para los 4 roles (D2).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    Notification::fake();
});

function forgotRequest($test, string $email)
{
    $test->startCookieSession();

    return $test->browserRequest('POST', '/api/password/forgot', ['email' => $email]);
}

/** Una cuenta de cada rol, activa y con su contraseña configurada. */
function forgotAccount(UserRole $role, array $attributes = []): User
{
    return match ($role) {
        UserRole::INSTITUTION => User::factory()->forInstitution(Institution::factory()->create())->create($attributes),
        UserRole::COMPANY => User::factory()->forCompany(Company::factory()->create())->create($attributes),
        default => User::factory()->role($role)->create($attributes),
    };
}

it('envía el enlace a una cuenta activa de cualquier rol (CA-02)', function (UserRole $role) {
    $user = forgotAccount($role, ['email' => strtolower($role->value).'@example.test']);

    forgotRequest($this, ' '.strtoupper($user->email).' ')->assertStatus(202)
        ->assertExactJson(['message' => PasswordForgotController::NEUTRAL_MESSAGE]);

    Notification::assertSentTo($user, ResetInstitutionPassword::class,
        fn (ResetInstitutionPassword $notification) => $notification->initiator === ResetInstitutionPassword::SELF_INITIATOR
            && str_contains($notification->resetUrl, '/reset-password?'));
})->with([[UserRole::ADMIN], [UserRole::SECRETARY], [UserRole::INSTITUTION], [UserRole::COMPANY]]);

it('responde exactamente igual cuando la cuenta no existe o no puede recibir el enlace (CA-01, CA-02)', function () {
    $inactive = User::factory()->role(UserRole::SECRETARY)->create(['email' => 'inactiva@example.test', 'is_active' => false]);
    $pending = User::factory()->role(UserRole::SECRETARY)->create(['email' => 'pendiente@example.test']);
    $pending->forceFill(['password_setup_required' => true])->save();
    $closedInstitution = forgotAccount(UserRole::INSTITUTION, ['email' => 'institucion@example.test']);
    $closedInstitution->institution->forceFill(['is_active' => false])->save();
    $closedCompany = forgotAccount(UserRole::COMPANY, ['email' => 'empresa@example.test']);
    $closedCompany->company->forceFill(['is_active' => false])->save();
    $reference = forgotRequest($this, 'nadie@example.test')->assertStatus(202)->getContent();

    foreach (['inactiva@example.test', 'pendiente@example.test', 'institucion@example.test', 'empresa@example.test'] as $email) {
        expect(forgotRequest($this, $email)->assertStatus(202)->getContent())->toBe($reference);
    }
    Notification::assertNothingSent();
});

it('el enlace restablece la contraseña e inicia sesión con la nueva', function () {
    $user = forgotAccount(UserRole::COMPANY, ['email' => 'olvido@example.test']);
    forgotRequest($this, 'olvido@example.test')->assertStatus(202);
    $notification = Notification::sent($user, ResetInstitutionPassword::class)->last();
    parse_str(parse_url($notification->resetUrl, PHP_URL_QUERY), $query);

    $this->browserRequest('POST', '/api/institution-accounts/password-reset', [
        'email' => $query['email'], 'token' => $query['token'], 'password' => 'Nueva-Contraseña-2026', 'password_confirmation' => 'Nueva-Contraseña-2026',
    ])->assertNoContent();
    $this->loginWithCookies($user->fresh(), ['password' => 'Nueva-Contraseña-2026'])->assertOk();
});

it('respeta el minuto entre enlaces del mismo correo sin cambiar la respuesta', function () {
    $user = forgotAccount(UserRole::SECRETARY, ['email' => 'minuto@example.test']);

    forgotRequest($this, 'minuto@example.test')->assertStatus(202);
    forgotRequest($this, 'minuto@example.test')->assertStatus(202);

    Notification::assertSentToTimes($user, ResetInstitutionPassword::class, 1);
});

it('limita a 3 solicitudes por hora por correo, exista o no la cuenta (CA-03)', function () {
    foreach (range(1, 3) as $attempt) {
        forgotRequest($this, 'limite@example.test')->assertStatus(202);
    }
    forgotRequest($this, 'limite@example.test')->assertStatus(429);
    // Otro correo desde la misma IP sigue disponible (el límite por IP es de 10 por minuto).
    forgotRequest($this, 'otro@example.test')->assertStatus(202);
});

it('limita a 10 solicitudes por minuto por IP (CA-03)', function () {
    foreach (range(1, 10) as $attempt) {
        forgotRequest($this, "ip-{$attempt}@example.test")->assertStatus(202);
    }
    forgotRequest($this, 'ip-11@example.test')->assertStatus(429);
});

it('valida el correo sin revelar nada y exige CSRF', function () {
    forgotRequest($this, 'no-es-correo')->assertUnprocessable()->assertJsonValidationErrors('email');
    $this->browserRequest('POST', '/api/password/forgot', ['email' => 'csrf@example.test'], csrf: false)->assertStatus(419);
});
