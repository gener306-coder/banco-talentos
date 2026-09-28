<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Esta SPA sólo utiliza sesiones; no consulta ni emite API tokens.
        Sanctum::getAccessTokenFromRequestUsing(fn (Request $request) => null);

        RateLimiter::for('login', function (Request $request): array {
            $email = $request->input('email');
            $email = is_string($email) ? Str::lower(trim($email)) : '';
            $response = fn (Request $request, array $headers) => response()->json([
                'message' => 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
            ], 429, $headers);

            return [
                Limit::perMinute(5)->by('account:'.hash('sha256', $email.'|'.$request->ip()))->response($response),
                Limit::perMinute(20)->by('ip:'.$request->ip())->response($response),
            ];
        });
    }
}
