<?php

namespace App\Http\Middleware;

use App\Enums\UserRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Las cuentas INSTITUTION y COMPANY operan siempre dentro de su organización: sin institución o empresa vinculada
 * reciben 403 (HU-S3-01 para el catálogo de habilidades, HU-S5-02 CA-01 para las oportunidades).
 */
class EnsureOrganizationMember
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        abort_if(match ($user?->role) {
            UserRole::INSTITUTION => $user->institution_id === null,
            UserRole::COMPANY => $user->company_id === null,
            default => false,
        }, 403);

        return $next($request);
    }
}
