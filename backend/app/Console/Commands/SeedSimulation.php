<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\GuardsSimulation;
use App\Enums\MexicanState;
use App\Support\Simulation\SimulationDataset;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Carga datos aleatorios con volumen de piloto en la base de simulación (tarea transversal de simulación de carga). */
class SeedSimulation extends Command
{
    use GuardsSimulation;

    protected $signature = 'simulation:seed
        {--institutions=16 : Instituciones educativas}
        {--students=3000 : Alumnos promedio por institución}
        {--companies=150 : Empresas validadas}
        {--opportunities=600 : Oportunidades Duales}
        {--linkages=5000 : Solicitudes de vinculación}
        {--state=15 : Clave INEGI del estado principal}
        {--seed=20261029 : Semilla para reproducir los mismos datos}
        {--password= : Contraseña de las cuentas de demostración; sin ella se genera una}
        {--fresh : Borra la base de simulación y vuelve a migrar antes de cargar}';

    protected $description = 'Carga datos aleatorios realistas en la base de simulación.';

    private const TABLES = [
        'institutions', 'users', 'students', 'student_identities', 'student_skills', 'student_languages',
        'student_certifications', 'student_projects', 'student_social_security', 'companies', 'opportunities',
        'linkage_requests',
    ];

    public function handle(): int
    {
        if (! $this->simulationAllowed()) {
            return self::FAILURE;
        }

        $options = [];
        foreach (['institutions' => 1, 'students' => 1, 'companies' => 1, 'opportunities' => 1, 'linkages' => 0, 'seed' => 0] as $name => $minimum) {
            $value = filter_var($this->option($name), FILTER_VALIDATE_INT, ['options' => ['min_range' => $minimum]]);
            if ($value === false) {
                $this->error("--{$name} debe ser un entero mayor o igual que {$minimum}.");

                return self::FAILURE;
            }
            $options[$name] = $value;
        }
        $options['state'] = (string) $this->option('state');
        if (MexicanState::tryFrom($options['state']) === null) {
            $this->error('--state debe ser una clave INEGI de estado (01 a 32).');

            return self::FAILURE;
        }
        $password = (string) ($this->option('password') ?: Str::password(20, symbols: false));
        if (strlen($password) < 12) {
            $this->error('--password debe tener al menos 12 caracteres.');

            return self::FAILURE;
        }

        if ($this->option('fresh')) {
            $this->call('migrate:fresh', ['--force' => true]);
        } elseif (DB::table('users')->exists()) {
            $this->error('La base de simulación ya tiene datos. Usa --fresh para borrarla y volver a cargar.');

            return self::FAILURE;
        }

        $started = microtime(true);
        $accounts = (new SimulationDataset($options, fn (string $label, int $count) => $this->line(sprintf('  %-30s %s', $label, number_format($count)))))
            ->run($password);
        DB::statement('ANALYZE');

        $this->newLine();
        $this->table(['Tabla', 'Filas'], array_map(fn (string $table) => [$table, number_format(DB::table($table)->count())], self::TABLES));
        $this->info(sprintf('Carga completada en %.1f s.', microtime(true) - $started));
        $this->newLine();
        $this->line('Cuentas de demostración (contraseña común: '.$password.'):');
        foreach (['ADMIN' => $accounts['admin'], 'SECRETARY' => $accounts['secretary'], 'INSTITUTION' => $accounts['institution'], 'COMPANY' => $accounts['company']] as $role => $email) {
            $this->line(sprintf('  %-12s %s', $role, $email));
        }

        return self::SUCCESS;
    }
}
