<?php

// CV normalizado (HU-S3-01). Dominios que el servidor reconoce; nunca abre las URLs.
return [
    // Un enlace de estos tipos debe pertenecer a su dominio (o a un subdominio, como mx.linkedin.com).
    'link_hosts' => [
        'github' => 'github.com',
        'linkedin' => 'linkedin.com',
        'behance' => 'behance.net',
    ],

    // Plataformas cuyas credenciales una empresa puede comprobar abriendo el enlace (Credly emite las de Cisco,
    // AWS o IBM). Ampliable.
    'verifiable_credential_hosts' => [
        'credly.com',
        'youracclaim.com',
        'coursera.org',
        'learn.microsoft.com',
        'udemy.com',
        'linkedin.com',
    ],
];
