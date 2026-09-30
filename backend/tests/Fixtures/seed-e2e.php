<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$connection = config('database.connections.pgsql');

if (! $app->environment('testing')
    || config('database.default') !== 'pgsql'
    || $connection['database'] !== 'banco_talentos_e2e_testing'
    || ! empty($connection['url'])
) {
    throw new RuntimeException('Las cuentas E2E sólo pueden crearse en la base aislada de pruebas.');
}

$accounts = [
    [
        'email' => getenv('E2E_EMAIL'),
        'password' => getenv('E2E_PASSWORD'),
        'name' => 'Usuario de prueba E2E',
        'role' => UserRole::INSTITUTION,
    ],
    [
        'email' => getenv('E2E_ADMIN_EMAIL'),
        'password' => getenv('E2E_ADMIN_PASSWORD'),
        'name' => 'Administrador de prueba E2E',
        'role' => UserRole::ADMIN,
    ],
];

foreach ($accounts as $account) {
    if (! is_string($account['email']) || ! filter_var($account['email'], FILTER_VALIDATE_EMAIL)
        || ! is_string($account['password']) || strlen($account['password']) < 24
    ) {
        throw new RuntimeException('Ejecuta scripts/test-e2e.sh para generar las credenciales efímeras.');
    }
}

if (strtolower($accounts[0]['email']) === strtolower($accounts[1]['email'])) {
    throw new RuntimeException('Las cuentas E2E requieren correos distintos.');
}

foreach ($accounts as $account) {
    User::query()->updateOrCreate(['email' => $account['email']], [
        'name' => $account['name'],
        'password' => $account['password'],
        'role' => $account['role'],
        'is_active' => true,
    ]);
}
