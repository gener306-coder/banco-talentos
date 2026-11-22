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

        RateLimiter::for('password-setup', function (Request $request): array {
            $email = $request->input('email');
            $email = is_string($email) ? Str::lower(trim($email)) : '';

            return [
                Limit::perMinute(10)->by('setup-ip:'.$request->ip()),
                Limit::perMinute(5)->by('setup-email:'.hash('sha256', $email)),
            ];
        });

        RateLimiter::for('password-reset', function (Request $request): array {
            $email = $request->input('email');
            $email = is_string($email) ? Str::lower(trim($email)) : '';

            return [
                Limit::perMinute(10)->by('reset-ip:'.$request->ip()),
                Limit::perMinute(5)->by('reset-email:'.hash('sha256', $email)),
            ];
        });

        RateLimiter::for('institution-password-reset', fn (Request $request) => Limit::perMinute(10)->by('reset-start-admin:'.$request->user()->id)
        );

        RateLimiter::for('institution-setup-resend', fn (Request $request) => Limit::perMinute(10)->by('setup-resend-admin:'.$request->user()->id)
        );

        // HU-S4-05 CA-09: límite por cuenta para impedir la extracción masiva de perfiles.
        RateLimiter::for('talent-search', fn (Request $request) => Limit::perMinute(60)->by('talent-search:'.$request->user()->id)
        );

        // HU-S5-04: una solicitud de vinculación es un envío deliberado; el límite frena el envío masivo.
        RateLimiter::for('linkage-requests', fn (Request $request) => Limit::perMinute(20)->by('linkage-requests:'.$request->user()->id)
        );

        // HU-S14-01: el nombre propio cambia poco; la contraseña, aún menos, y su límite frena la adivinación de la actual.
        RateLimiter::for('account-update', fn (Request $request) => Limit::perMinute(10)->by('account-update:'.$request->user()->id)
        );
        RateLimiter::for('account-password', fn (Request $request) => Limit::perMinute(5)->by('account-password:'.$request->user()->id)
        );
        // HU-S14-02: el perfil de la organización, por cuenta.
        RateLimiter::for('organization-profile', fn (Request $request) => Limit::perMinute(10)->by('organization-profile:'.$request->user()->id)
        );

        // Auditoría QA (#10): límite general de las escrituras de la API (POST, PUT, PATCH), además de los específicos
        // (acceso, contraseñas, búsqueda, subidas, exportaciones…), que siguen aplicando: 300 por minuto por cuenta y 120
        // por IP sin sesión. Las lecturas no pasan por él: con la caché en base de datos, cada conteo es una transacción
        // con FOR UPDATE sobre la fila de la cuenta, y las peticiones en paralelo de la SPA (incluido el sondeo de
        // mensajes) se formaban en fila (la suite E2E pasó de 8.7 a 13 minutos). La lectura masiva ya está acotada donde
        // importa: búsqueda de talento (60/min) y exportaciones (10/min). Limit::none() no toca la caché.
        RateLimiter::for('api', fn (Request $request) => match (true) {
            $request->isMethodSafe() => Limit::none(),
            $request->user() !== null => Limit::perMinute(300)->by('api:user:'.$request->user()->id),
            default => Limit::perMinute(120)->by('api:ip:'.$request->ip()),
        });

        // Auditoría QA: las subidas (videos y comprobantes) ocupan disco y procesamiento; las exportaciones CSV recorren
        // tablas completas. Un límite por cuenta frena el abuso sin afectar el uso normal.
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(20)->by('uploads:'.$request->user()->id)
        );
        RateLimiter::for('exports', fn (Request $request) => Limit::perMinute(10)->by('exports:'.$request->user()->id)
        );

        // HU-S13-01: la conversación es entre personas; el límite frena el envío automatizado.
        RateLimiter::for('linkage-messages', fn (Request $request) => Limit::perMinute(30)->by('linkage-messages:'.$request->user()->id)
        );

        RateLimiter::for('company-setup-resend', fn (Request $request) => Limit::perMinute(10)->by('company-setup-resend:'.$request->user()->id)
        );

        RateLimiter::for('secretary-setup-resend', fn (Request $request) => Limit::perMinute(10)->by('secretary-setup-resend:'.$request->user()->id)
        );

        // HU-S6-04: inicio del restablecimiento de cuentas SECRETARY y COMPANY, por cuenta que lo inicia.
        RateLimiter::for('account-password-reset', fn (Request $request) => Limit::perMinute(10)->by('account-password-reset:'.$request->user()->id)
        );

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
