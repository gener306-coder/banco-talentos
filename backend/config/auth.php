<?php

use App\Models\User;

return [
    'defaults' => [
        'guard' => 'web',
        'passwords' => 'institution_setup',
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
    'passwords' => [
        'institution_setup' => [
            'provider' => 'users',
            'table' => 'institution_password_setup_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
        'institution_reset' => [
            'provider' => 'users',
            'table' => 'institution_password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
    ],
];
