<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use App\Services\InitialPasswordLink;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\Support\InteractsWithCookieSessions;

// Real commits are required here: no enclosing RefreshDatabase transaction.
uses(DatabaseMigrations::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
});

it('keeps a committed account recoverable after mail failures during creation and resend', function (string $environment) {
    $this->app->detectEnvironment(fn () => $environment);
    $notifications = [];
    Notification::shouldReceive('send')->times(3)->andReturnUsing(function ($user, SetInitialPassword $notification) use (&$notifications): void {
        // Delivery catches transport failures; the final expected sent status
        // also ensures these commit assertions were not swallowed.
        expect(DB::transactionLevel())->toBe(0);
        expect(User::find($user->id))->not->toBeNull();
        expect(DB::table('institution_password_setup_tokens')->where('email', $user->email)->exists())->toBeTrue();
        $notifications[] = $notification;
        if (count($notifications) < 3) {
            throw new RuntimeException('SMTP failure with a secret that must not be logged: '.$notification->setupUrl);
        }
    });
    Log::shouldReceive('warning')->twice()->withArgs(function (string $message, array $context): bool {
        expect($message)->toBe('No se pudo enviar el enlace de configuración inicial.');
        expect(array_keys($context))->toBe(['user_id', 'exception_type']);
        expect($context['exception_type'])->toBe(RuntimeException::class);

        return true;
    });

    try {
        $payload = ['name' => 'Cuenta pendiente', 'email' => 'delivery@example.test', 'institution_id' => $this->institution->id];
        $created = $this->browserRequest('POST', '/api/institution-accounts', $payload)
            ->assertCreated()->assertJsonPath('setup_delivery', 'pending')
            ->assertJsonMissingPath('setup_url')->assertJsonMissingPath('data.password');
        $user = User::findOrFail($created->json('data.id'));
        $original = $user->getAttributes();
        expect($user->password_setup_required)->toBeTrue();
        $this->assertDatabaseCount('institution_password_setup_tokens', 1);

        $this->travel(61)->seconds();
        $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $payload)
            ->assertOk()->assertJsonPath('setup_delivery', 'pending')->assertJsonMissingPath('setup_url');
        expect($user->fresh()->getAttributes())->toBe($original);
        $this->travel(61)->seconds();
        $this->browserRequest('POST', '/api/institution-accounts/resend-setup', $payload)
            ->assertOk()->assertJsonPath('setup_delivery', 'sent')->assertJsonMissingPath('setup_url');
        expect($user->fresh()->getAttributes())->toBe($original);
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('institution_password_setup_tokens', 1);

        expect($notifications)->toHaveCount(3);
        foreach ($notifications as $index => $notification) {
            parse_str(parse_url($notification->setupUrl, PHP_URL_QUERY), $query);
            expect(Password::broker('institution_setup')->tokenExists($user, $query['token']))->toBe($index === 2);
            expect($created->getContent())->not->toContain($query['token']);
        }
    } finally {
        $this->app->detectEnvironment(fn () => 'testing');
    }
})->with(['local', 'production']);

it('discards scheduled mail together with account and token when a transaction rolls back', function () {
    Notification::fake();
    $this->app->detectEnvironment(fn () => 'local');
    try {
        expect(function () {
            DB::transaction(function () {
                $user = User::factory()->forInstitution($this->institution)->create([
                    'email' => 'rollback@example.test', 'password_setup_required' => true,
                ]);
                $links = app(InitialPasswordLink::class);
                $url = $links->issue($user);
                expect($links->deliverAfterCommit($user, $url))->toBe('pending');
                Notification::assertNothingSent();
                throw new RuntimeException('Cancel before commit');
            });
        })->toThrow(RuntimeException::class, 'Cancel before commit');
        Notification::assertNothingSent();
        $this->assertDatabaseMissing('users', ['email' => 'rollback@example.test']);
        $this->assertDatabaseMissing('institution_password_setup_tokens', ['email' => 'rollback@example.test']);
    } finally {
        $this->app->detectEnvironment(fn () => 'testing');
    }
});

it('delays mail until the outermost transaction has committed', function () {
    Notification::fake();
    $this->app->detectEnvironment(fn () => 'local');
    try {
        $user = DB::transaction(function () {
            $user = DB::transaction(function () {
                $user = User::factory()->forInstitution($this->institution)->create(['password_setup_required' => true]);
                $links = app(InitialPasswordLink::class);
                $url = $links->issue($user);
                expect($links->deliverAfterCommit($user, $url))->toBe('pending');
                Notification::assertNothingSent();

                return $user;
            });
            Notification::assertNothingSent();

            return $user;
        });
        expect(DB::transactionLevel())->toBe(0);
        Notification::assertSentTo($user, SetInitialPassword::class);
    } finally {
        $this->app->detectEnvironment(fn () => 'testing');
    }
});
