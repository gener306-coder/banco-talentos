<?php

use App\Models\User;

return [
    'defaults' => [
        'guard' => 'web',
        'passwords' => null,
    ],
    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
    ],
    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => User::class,
        ],
    ],
    'passwords' => [],
];
