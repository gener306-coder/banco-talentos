<?php

use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        // La API responde 401 también a clientes que no solicitan JSON.
        $middleware->redirectGuestsTo(null);
        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'role' => EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => true,
        );
        $exceptions->render(fn (AuthenticationException $exception) => response()->json([
            'message' => 'No autenticado.',
        ], 401));
        $exceptions->render(function (HttpException $exception) {
            return match ($exception->getStatusCode()) {
                403 => response()->json(['message' => 'No tienes permiso para acceder a este recurso.'], 403),
                419 => response()->json(['message' => 'La sesión expiró. Vuelve a intentarlo.'], 419),
                default => null,
            };
        });
    })->create();
