<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Symfony\Component\HttpFoundation\Response;

/**
 * Límite general de la API (auditoría QA #10): 300 escrituras (POST, PUT, PATCH) por minuto por cuenta y 120 por IP sin
 * sesión. Los límites específicos (acceso, contraseñas, búsqueda, subidas, exportaciones) siguen en la caché
 * compartida de la base de datos.
 *
 * Este contador vive en la caché de archivos: en la base de datos, cada conteo agrega transacciones con FOR UPDATE y la
 * suite E2E pasaba de 9.2 a más de 10 minutos, con flujos largos excediendo su tiempo. Con varios servidores, el límite
 * aplica por servidor. Para un límite global entre servidores, usar el del servidor web o el balanceador
 * (docs/qa-pre-release-audit.md).
 *
 * Las lecturas no se cuentan (Limit::none() no toca la caché). La lectura masiva ya está acotada donde importa:
 * búsqueda de talento (60/min) y exportaciones (10/min).
 */
class ThrottleApiRequests extends ThrottleRequests
{
    public const LIMITER = 'api';

    public function __construct(CacheFactory $cache)
    {
        $limiter = new RateLimiter($cache->store(config('cache.api_limiter_store', 'file')));
        $limiter->for(self::LIMITER, fn (Request $request) => self::limit($request));
        parent::__construct($limiter);
    }

    public static function limit(Request $request): Limit
    {
        return match (true) {
            $request->isMethodSafe() => Limit::none(),
            $request->user() !== null => Limit::perMinute(300)->by('api:user:'.$request->user()->id),
            default => Limit::perMinute(120)->by('api:ip:'.$request->ip()),
        };
    }

    public function handle($request, Closure $next, $maxAttempts = 60, $decayMinutes = 1, $prefix = ''): Response
    {
        return parent::handle($request, $next, self::LIMITER);
    }
}
