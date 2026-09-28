<?php

namespace Tests\Support;

use App\Models\User;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Facade;
use Illuminate\Testing\TestResponse;

trait InteractsWithCookieSessions
{
    private array $browserCookies = [];

    private string $sessionDirectory;

    public function initializeCookieBrowser(): void
    {
        $this->sessionDirectory = sys_get_temp_dir().'/banco-talentos-testing-'.bin2hex(random_bytes(12));
        mkdir($this->sessionDirectory, 0700, true);

        config([
            'session.driver' => 'file',
            'session.files' => $this->sessionDirectory,
            'session.lottery' => [0, 100],
            'sanctum.stateful' => ['localhost:5173'],
        ]);

        $this->app->bind(PreventRequestForgery::class, EnforceRequestForgery::class);
        $this->app->bind(VerifyCsrfToken::class, EnforceRequestForgery::class);
        $this->app->bind(ValidateCsrfToken::class, EnforceRequestForgery::class);

        $this->beforeApplicationDestroyed(function (): void {
            $this->app['files']->deleteDirectory($this->sessionDirectory);
        });
    }

    public function browserRequest(
        string $method,
        string $uri,
        array $data = [],
        bool $csrf = true,
        array $headers = [],
    ): TestResponse {
        // HTTP workers do not carry a resolved guard or session store into the
        // next request. Keep the transactional DB connection, but reset these
        // services so a stale cookie cannot pass through a cached user.
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $this->app['session']->forgetDrivers();
        $this->app->forgetInstance('session.store');
        $this->app->forgetInstance(StartSession::class);
        Facade::clearResolvedInstance('session');

        $requestHeaders = [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'Origin' => 'http://localhost:5173',
            'Referer' => 'http://localhost:5173/',
        ];

        // Deliberately omit Sec-Fetch-Site: same-origin would bypass token
        // validation under Laravel 13 and produce a false-positive CSRF test.
        if ($csrf && isset($this->browserCookies['XSRF-TOKEN'])) {
            $requestHeaders['X-XSRF-TOKEN'] = $this->browserCookies['XSRF-TOKEN'];
        }

        $response = $this->call(
            $method,
            $uri,
            [],
            $this->browserCookies,
            [],
            $this->transformHeadersToServerVars(array_replace($requestHeaders, $headers)),
            json_encode($data, JSON_THROW_ON_ERROR),
        );

        // Values are already encrypted by the response middleware; pass them
        // directly to the next HTTP request without re-encrypting them.
        foreach ($response->baseResponse->headers->getCookies() as $cookie) {
            $this->browserCookies[$cookie->getName()] = $cookie->getValue();
        }

        return $response;
    }

    public function startCookieSession(): TestResponse
    {
        return $this->browserRequest('GET', '/sanctum/csrf-cookie')
            ->assertNoContent()
            ->assertCookie('XSRF-TOKEN')
            ->assertCookie(config('session.cookie'));
    }

    public function loginWithCookies(User $user, array $extra = []): TestResponse
    {
        $this->startCookieSession();

        return $this->browserRequest('POST', '/api/login', array_replace([
            'email' => $user->email,
            'password' => 'Password123!',
        ], $extra));
    }

    public function currentBrowserCookies(): array
    {
        return $this->browserCookies;
    }

    public function replaceBrowserCookies(array $cookies): void
    {
        $this->browserCookies = $cookies;
    }

    public function currentSessionId(): string
    {
        return CookieValuePrefix::remove($this->app['encrypter']->decrypt(
            $this->browserCookies[config('session.cookie')],
            false,
        ));
    }

    public function sessionFile(string $sessionId): string
    {
        return $this->sessionDirectory.'/'.$sessionId;
    }
}
