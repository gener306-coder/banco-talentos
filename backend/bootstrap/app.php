<?php

use App\Http\Middleware\ApiSecurityHeaders;
use App\Http\Middleware\EnsureInstitutionMember;
use App\Http\Middleware\EnsureOrganizationMember;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureUserIsActive;
use App\Http\Middleware\ThrottleApiRequests;
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
        // Auditoría QA: Cache-Control no-store y cabeceras de seguridad en todas las respuestas, también en los errores.
        $middleware->append(ApiSecurityHeaders::class);
        // Auditoría QA (#10): límite general de escrituras en el grupo api, con su contador en la caché de archivos.
        $middleware->api(append: [ThrottleApiRequests::class]);
        // La API responde 401 también a clientes que no solicitan JSON.
        $middleware->redirectGuestsTo(null);
        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'role' => EnsureRole::class,
            'institution.member' => EnsureInstitutionMember::class,
            'organization.member' => EnsureOrganizationMember::class,
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
