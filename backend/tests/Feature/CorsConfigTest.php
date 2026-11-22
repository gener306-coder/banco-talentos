<?php

// Auditoría QA #11: CORS explícito, sin el comodín por defecto y sin credenciales entre orígenes.

it('permite solo los orígenes configurados (por defecto, FRONTEND_URL) y nunca el comodín', function () {
    $origins = config('cors.allowed_origins');

    expect($origins)->not->toContain('*')
        ->and($origins)->not->toBe([])
        ->and(config('cors.supports_credentials'))->toBeFalse();
    if (env('CORS_ALLOWED_ORIGINS') === null || env('CORS_ALLOWED_ORIGINS') === '') {
        expect($origins)->toBe([rtrim(config('app.frontend_url'), '/')]);
    }
});

it('responde la verificación previa al origen permitido y no a otro', function () {
    $allowed = config('cors.allowed_origins')[0];
    $preflight = fn (string $origin) => $this->call('OPTIONS', '/api/me', server: [
        'HTTP_ORIGIN' => $origin,
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
    ]);

    $ok = $preflight($allowed);
    expect($ok->headers->get('Access-Control-Allow-Origin'))->toBe($allowed)
        ->and($ok->headers->has('Access-Control-Allow-Credentials'))->toBeFalse();

    expect($preflight('https://sitio-ajeno.example')->headers->get('Access-Control-Allow-Origin'))->not->toBe('https://sitio-ajeno.example')
        ->and($preflight('https://sitio-ajeno.example')->headers->get('Access-Control-Allow-Origin'))->not->toBe('*');
});
