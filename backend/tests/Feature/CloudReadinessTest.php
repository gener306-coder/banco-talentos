<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// Tareas técnicas T-01 y T-02 del Sprint 4: la base queda lista para una instancia administrada (RDS)
// y varias instancias de la API comparten sesiones y límites de frecuencia.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

it('creates the PostGIS extension through a migration that runs before any spatial column (T-01)', function () {
    expect(DB::selectOne("SELECT extname FROM pg_extension WHERE extname = 'postgis'"))->not->toBeNull();

    $migrations = collect(glob(database_path('migrations/*.php')))->map(fn (string $path) => basename($path, '.php'))->sort()->values();
    expect($migrations->first())->toBe('2026_09_26_000000_enable_postgis_extension');

    // Idempotente: repetirla en una base que ya la tiene no falla.
    DB::statement('CREATE EXTENSION IF NOT EXISTS postgis');
});

it('uses the database for sessions and cache by default (T-02)', function () {
    expect(config('session.driver'))->toBe('database')
        ->and(config('cache.default'))->toBe('database');

    $configured = require config_path('session.php');
    expect($configured['driver'])->toBe(env('SESSION_DRIVER'));
});

it('stores the authenticated session in the sessions table and deletes it on logout (T-02)', function () {
    $user = User::factory()->create();
    $this->loginWithCookies($user)->assertOk();
    $sessionId = $this->currentSessionId();

    expect($this->sessionExists($sessionId))->toBeTrue();
    $this->browserRequest('GET', '/api/me')->assertOk()->assertJsonPath('user.id', $user->id);

    $this->browserRequest('POST', '/api/logout')->assertNoContent();

    expect($this->sessionExists($sessionId))->toBeFalse();
});

it('keeps the login rate limit counters in the shared database cache (T-02)', function () {
    $user = User::factory()->create();
    $this->startCookieSession();

    foreach (range(1, 5) as $attempt) {
        $this->browserRequest('POST', '/api/login', ['email' => $user->email, 'password' => 'incorrecta-'.$attempt])
            ->assertStatus(422);
    }

    expect(DB::table('cache')->where('key', 'like', config('cache.prefix').'%')->exists())->toBeTrue();

    $this->browserRequest('POST', '/api/login', ['email' => $user->email, 'password' => 'Password123!'])
        ->assertStatus(429);
});
