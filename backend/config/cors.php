<?php

/*
 * CORS (auditoría QA #11). La SPA y la API se sirven en el mismo sitio (el servidor de desarrollo de Vite y el de
 * producción redirigen /api y /sanctum), así que el navegador no necesita CORS para operar. Esta configuración solo
 * evita el comodín `*` por defecto: otros orígenes no reciben permiso para leer las respuestas.
 *
 * - CORS_ALLOWED_ORIGINS: orígenes exactos separados por comas (https://banco.example.mx). Si se omite, se usa
 *   FRONTEND_URL, que en cada entorno ya es el origen de la SPA (5173 en desarrollo y pruebas, 5180 en la simulación).
 * - supports_credentials en false: la sesión viaja en cookies SameSite=Lax del mismo sitio, nunca entre orígenes.
 */

$origins = array_values(array_filter(array_map(
    fn (string $origin): string => rtrim(trim($origin), '/'),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')),
)));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],

    'allowed_origins' => $origins !== [] ? $origins : [rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/')],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN'],

    'exposed_headers' => [],

    'max_age' => 600,

    'supports_credentials' => false,
];
