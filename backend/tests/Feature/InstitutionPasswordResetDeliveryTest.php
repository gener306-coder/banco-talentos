<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use App\Services\InstitutionPasswordResetLink;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

// Commits reales: sin la transacción envolvente de RefreshDatabase.
uses(DatabaseMigrations::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->payload = ['email' => $this->account->email, 'institution_id' => $this->institution->id];
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
});

it('sends the link only after the token is committed and keeps the reset recoverable after mail failures', function () {
    $notifications = [];
    Notification::shouldReceive('send')->twice()->andReturnUsing(function ($user, ResetInstitutionPassword $notification) use (&$notifications): void {
        // El token ya está confirmado en la base cuando se intenta el envío.
        expect(DB::transactionLevel())->toBe(0);
        expect(DB::table('institution_password_reset_tokens')->where('email', $user->email)->exists())->toBeTrue();
        $notifications[] = $notification;
        if (count($notifications) === 1) {
            throw new RuntimeException('SMTP failure with a secret that must not be logged: '.$notification->resetUrl);
        }
    });
    Log::shouldReceive('warning')->once()->withArgs(function (string $message, array $context): bool {
        expect($message)->toBe('No se pudo enviar el enlace de restablecimiento de contraseña.');
        expect(array_keys($context))->toBe(['user_id', 'exception_type']);
        expect($context['exception_type'])->toBe(RuntimeException::class);

        return true;
    });

    $original = $this->account->fresh()->getAttributes();
    $first = $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->payload)
        ->assertOk()->assertExactJson(['reset_delivery' => 'pending']);
    $this->travel(61)->seconds();
    $second = $this->browserRequest('POST', '/api/institution-accounts/password-reset/start', $this->payload)
        ->assertOk()->assertExactJson(['reset_delivery' => 'sent']);

    expect($this->account->fresh()->getAttributes())->toBe($original);
    $this->assertDatabaseCount('institution_password_reset_tokens', 1);
    foreach ($notifications as $index => $notification) {
        parse_str(parse_url($notification->resetUrl, PHP_URL_QUERY), $query);
        expect(Password::broker('institution_reset')->tokenExists($this->account, $query['token']))->toBe($index === 1);
        expect($first->getContent().$second->getContent())->not->toContain($query['token']);
    }
});

it('discards the scheduled mail together with the token when the transaction rolls back', function () {
    Notification::fake();
    expect(function () {
        DB::transaction(function () {
            $links = app(InstitutionPasswordResetLink::class);
            $url = $links->issue($this->account);
            expect($links->deliverAfterCommit($this->account, $url))->toBe('pending');
            Notification::assertNothingSent();
            throw new RuntimeException('Cancel before commit');
        });
    })->toThrow(RuntimeException::class, 'Cancel before commit');

    Notification::assertNothingSent();
    $this->assertDatabaseMissing('institution_password_reset_tokens', ['email' => $this->account->email]);
});
