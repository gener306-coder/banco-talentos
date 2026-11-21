<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad de todas las respuestas del backend (auditoría QA previa a producción).
 *
 * - `Cache-Control: no-store, private` por defecto: antes dependía de cada controlador, y algunas respuestas
 *   autenticadas (el catálogo de habilidades) y los errores (401, 403, 404, 422, 429) salían con `no-cache`. Solo se
 *   respeta un `Cache-Control` explícito con `max-age` (medios firmados) o `no-store`.
 * - `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`: la API nunca se incrusta ni se interpreta con otro
 *   tipo, y no filtra la URL de origen. HSTS y CSP se configuran en el servidor web de producción (ver
 *   docs/qa-pre-release-audit.md).
 */
class ApiSecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $headers = $response->headers;

        if (! $headers->hasCacheControlDirective('max-age') && ! $headers->hasCacheControlDirective('no-store')) {
            $headers->set('Cache-Control', 'no-store, private');
        }
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('Referrer-Policy', 'no-referrer');

        return $response;
    }
}
