<?php

use App\Http\Middleware\ThrottleApiRequests;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Support\InteractsWithCookieSessions;

// Auditoría QA previa a producción: matriz de rutas y cabeceras de seguridad de todas las respuestas.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

/** Rutas públicas por diseño: acceso, enlaces de contraseña (token de un solo uso) y medios con URL firmada. */
const PUBLIC_API_ROUTES = [
    'api/login',
    'api/institution-accounts/password-setup',
    'api/institution-accounts/password-reset',
    // HU-S16-03: «Olvidé mi contraseña», con su límite por correo y por IP.
    'api/password/forgot',
    // T-S19-03 y T-S19-04: confirmación del correo de acceso con enlace de un solo uso, con o sin sesión.
    'api/account-email/confirm',
    'api/media/{path}',
];

/** @return list<LaravelRoute> */
function apiRoutes(): array
{
    return array_values(array_filter(Route::getRoutes()->getRoutes(), fn (LaravelRoute $route) => str_starts_with($route->uri(), 'api/')));
}

it('exige sesión, cuenta activa y rol en cada ruta de la API salvo las públicas por diseño', function () {
    $unprotected = [];
    foreach (apiRoutes() as $route) {
        if (in_array($route->uri(), PUBLIC_API_ROUTES, true)) {
            continue;
        }
        $middleware = $route->gatherMiddleware();
        $hasRole = collect($middleware)->contains(fn ($name) => is_string($name) && str_starts_with($name, 'role:'));
        // La salida cierra la sesión propia: basta con sesión activa.
        $needsRole = $route->uri() !== 'api/logout';
        if (! in_array('auth:sanctum', $middleware, true) || ! in_array('active', $middleware, true) || ($needsRole && ! $hasRole)) {
            $unprotected[] = implode('|', $route->methods()).' '.$route->uri();
        }
    }

    expect($unprotected)->toBe([]);
});

it('las rutas públicas tienen su propia protección: límite de intentos o firma', function () {
    $byUri = collect(apiRoutes())->keyBy(fn (LaravelRoute $route) => $route->uri());

    expect($byUri['api/login']->gatherMiddleware())->toContain('throttle:login')
        ->and($byUri['api/institution-accounts/password-setup']->gatherMiddleware())->toContain('throttle:password-setup')
        ->and($byUri['api/institution-accounts/password-reset']->gatherMiddleware())->toContain('throttle:password-reset')
        ->and($byUri['api/password/forgot']->gatherMiddleware())->toContain('throttle:password-forgot')
        ->and($byUri['api/account-email/confirm']->gatherMiddleware())->toContain('throttle:email-confirm')
        ->and($byUri['api/media/{path}']->gatherMiddleware())->toContain('signed:relative');
});

it('limita las subidas de archivos y las exportaciones CSV por cuenta', function () {
    $throttled = fn (string $method, string $uri) => collect(apiRoutes())
        ->first(fn (LaravelRoute $route) => $route->uri() === $uri && in_array($method, $route->methods(), true))
        ->gatherMiddleware();

    expect($throttled('POST', 'api/institution/videos'))->toContain('throttle:uploads')
        ->and($throttled('POST', 'api/students/{student}/social-security/document'))->toContain('throttle:uploads')
        ->and($throttled('GET', 'api/institution/linkage-requests/export.csv'))->toContain('throttle:exports')
        ->and($throttled('GET', 'api/reports/dual-program/export.csv'))->toContain('throttle:exports');
});

it('no expone rutas DELETE para ninguna entidad', function () {
    $deletes = collect(apiRoutes())->filter(fn (LaravelRoute $route) => in_array('DELETE', $route->methods(), true))
        ->map(fn (LaravelRoute $route) => $route->uri())->values()->all();

    expect($deletes)->toBe([]);
});

it('agrega Cache-Control no-store y las cabeceras de seguridad a respuestas autenticadas y a los errores', function () {
    $expectSecure = function ($response): void {
        $response->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer');
        expect($response->headers->get('Cache-Control'))->toContain('no-store')->toContain('private');
    };

    // 401 sin sesión.
    $expectSecure($this->browserRequest('GET', '/api/me')->assertUnauthorized());

    $this->loginWithCookies(User::factory()->forInstitution(Institution::factory()->create())->create())->assertOk();
    // Antes, el catálogo de habilidades salía con "no-cache".
    $expectSecure($this->browserRequest('GET', '/api/skills?q=py')->assertOk());
    // 404 de un recurso ajeno o inexistente y 403 de un rol sin permiso.
    $expectSecure($this->browserRequest('GET', '/api/students/999999')->assertNotFound());
    $expectSecure($this->browserRequest('GET', '/api/companies')->assertForbidden());
    // 422 de validación.
    $expectSecure($this->browserRequest('POST', '/api/students', [])->assertUnprocessable());
});

it('aplica el límite general a la API, salvo a los medios firmados (auditoría QA #10)', function () {
    $apiGroup = collect(app('router')->getMiddlewareGroups()['api']);
    expect($apiGroup)->toContain(ThrottleApiRequests::class);

    // Las rutas de acceso viven en web.php con su propio límite estricto; todas las demás están en el grupo api.
    $outside = collect(apiRoutes())
        ->reject(fn (LaravelRoute $route) => in_array($route->uri(), ['api/login', 'api/logout', 'api/institution-accounts/password-setup', 'api/institution-accounts/password-reset', 'api/password/forgot', 'api/account-email/confirm'], true))
        ->reject(fn (LaravelRoute $route) => in_array('api', $route->gatherMiddleware(), true))
        ->map(fn (LaravelRoute $route) => $route->uri())->values()->all();
    expect($outside)->toBe([]);

    $media = collect(apiRoutes())->first(fn (LaravelRoute $route) => $route->getName() === 'media.show');
    expect($media->excludedMiddleware())->toContain(ThrottleApiRequests::class);
});

/** El contador del límite general vive en la caché de archivos, no en la base de datos. */
function apiLimiter(): RateLimiter
{
    return new RateLimiter(Cache::store('file'));
}

it('el límite general es de 300 escrituras por minuto por cuenta y responde 429 al excederlo (auditoría QA #10)', function () {
    $account = User::factory()->forInstitution(Institution::factory()->create())->create();
    $this->loginWithCookies($account)->assertOk();
    // Se consumen 299 intentos sin peticiones HTTP para que la prueba sea rápida.
    $key = md5('api'.'api:user:'.$account->id);
    apiLimiter()->clear($key);
    for ($i = 0; $i < 299; $i++) {
        apiLimiter()->hit($key, 60);
    }

    $this->browserRequest('PATCH', '/api/me', ['name' => 'Coordinación'])->assertOk()->assertHeader('X-RateLimit-Limit', '300');
    $this->browserRequest('PATCH', '/api/me', ['name' => 'Coordinación dual'])->assertStatus(429);
    apiLimiter()->clear($key);
});

it('las lecturas no pasan por el límite general ni escriben en ninguna caché (auditoría QA #10)', function () {
    $account = User::factory()->forInstitution(Institution::factory()->create())->create();
    $this->loginWithCookies($account)->assertOk();
    $key = md5('api'.'api:user:'.$account->id);

    $response = $this->browserRequest('GET', '/api/me')->assertOk();
    expect($response->headers->has('X-RateLimit-Limit'))->toBeFalse()
        ->and(apiLimiter()->attempts($key))->toBe(0)
        ->and(DB::table('cache')->where('key', 'like', '%'.$key.'%')->exists())->toBeFalse();
});

it('una escritura cuenta en la caché de archivos y no en la tabla cache (auditoría QA #10)', function () {
    $account = User::factory()->forInstitution(Institution::factory()->create())->create();
    $this->loginWithCookies($account)->assertOk();
    $key = md5('api'.'api:user:'.$account->id);
    apiLimiter()->clear($key);

    $this->browserRequest('PATCH', '/api/me', ['name' => 'Coordinación'])->assertOk();
    expect(apiLimiter()->attempts($key))->toBe(1)
        ->and(DB::table('cache')->where('key', 'like', '%'.$key.'%')->exists())->toBeFalse();
    apiLimiter()->clear($key);
});
