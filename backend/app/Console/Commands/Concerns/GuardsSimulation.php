<?php

namespace App\Console\Commands\Concerns;

/**
 * Guarda de los comandos de simulación de carga: solo corren en el entorno de simulación (o en las pruebas) y sobre
 * una base cuyo nombre lo confirma, para que nunca escriban datos falsos en desarrollo ni en producción.
 */
trait GuardsSimulation
{
    protected function simulationAllowed(): bool
    {
        $connection = config('database.connections.'.config('database.default'));
        $database = (string) ($connection['database'] ?? '');
        $allowed = app()->environment('simulation', 'testing')
            && empty($connection['url'])
            && (str_ends_with($database, '_sim') || str_ends_with($database, '_testing'));

        if (! $allowed) {
            $this->error('Los comandos de simulación solo corren con APP_ENV=simulation sobre la base banco_talentos_sim (usa scripts/simulation.sh).');
        }

        return $allowed;
    }
}
