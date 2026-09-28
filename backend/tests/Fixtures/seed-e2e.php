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

$email = getenv('E2E_EMAIL');
$password = getenv('E2E_PASSWORD');

if (! is_string($email) || ! filter_var($email, FILTER_VALIDATE_EMAIL)
    || ! is_string($password) || strlen($password) < 24
) {
    throw new RuntimeException('Ejecuta scripts/test-e2e.sh para generar las credenciales efímeras.');
}

User::query()->updateOrCreate(['email' => $email], [
    'name' => 'Usuario de prueba E2E',
    'password' => $password,
    'role' => UserRole::INSTITUTION,
    'is_active' => true,
]);
