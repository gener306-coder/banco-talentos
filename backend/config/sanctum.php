<?php

use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

return [
    'routes' => true,
    'stateful' => array_filter(array_map('trim', explode(',', env(
        'SANCTUM_STATEFUL_DOMAINS',
        'localhost:5173,127.0.0.1:5173,localhost:8000,127.0.0.1:8000',
    )))),
    'guard' => ['web'],
    'middleware' => [
        // Cierra una sesión por cookie cuando cambia el hash de la contraseña de su usuario.
        'authenticate_session' => AuthenticateSession::class,
    ],
];
