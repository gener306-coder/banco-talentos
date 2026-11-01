<?php

return [
    'default' => env('QUEUE_CONNECTION', 'database'),

    'connections' => [
        'sync' => [
            'driver' => 'sync',
        ],

        // T-S9-01: cola en PostgreSQL, sin Redis. retry_after debe superar el --timeout del worker (900 s),
        // o un video que sigue procesándose se volvería a entregar a otro worker.
        'database' => [
            'driver' => 'database',
            'connection' => env('DB_QUEUE_CONNECTION'),
            'table' => 'jobs',
            'queue' => 'default',
            'retry_after' => (int) env('DB_QUEUE_RETRY_AFTER', 960),
            'after_commit' => true,
        ],
    ],

    'failed' => [
        'driver' => env('QUEUE_FAILED_DRIVER', 'database-uuids'),
        'database' => env('DB_CONNECTION', 'pgsql'),
        'table' => 'failed_jobs',
    ],
];
