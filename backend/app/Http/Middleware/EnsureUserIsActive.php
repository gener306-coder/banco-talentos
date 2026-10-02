<?php

namespace App\Http\Middleware;

use App\Exceptions\AccountAccessDenied;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user()?->fresh();

        $restriction = $user?->accessRestriction();

        if (! $user || ! $user->is_active || $restriction !== null) {
            Auth::guard('web')->logout();

            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            if ($restriction !== null) {
                throw new AccountAccessDenied($restriction);
            }

            throw new AuthenticationException;
        }

        Auth::guard('web')->setUser($user);
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
