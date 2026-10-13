<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Las operaciones sobre alumnos requieren una cuenta vinculada a una institución: todo se acota
 * a ella. Una cuenta INSTITUTION sin institución no puede gestionar alumnos.
 */
class EnsureInstitutionMember
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_if($request->user()?->institution_id === null, 403);

        return $next($request);
    }
}
