<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\GuardsSimulation;
use App\Support\Simulation\SimulationReport;
use App\Support\Simulation\SimulationScenarios;
use GuzzleHttp\Cookie\CookieJar;
use Illuminate\Console\Command;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Mide la latencia de los endpoints principales contra el backend de simulación por HTTP real, con sesión y CSRF
 * como la SPA. Peticiones secuenciales: mide el tiempo de cada vista, no la concurrencia.
 */
class BenchmarkSimulation extends Command
{
    use GuardsSimulation;

    protected $signature = 'simulation:benchmark
        {--url=http://127.0.0.1:8000 : Backend de simulación}
        {--origin=http://localhost:5180 : Origen de la SPA aceptado por Sanctum}
        {--repeat=20 : Repeticiones medidas por endpoint}
        {--password= : Contraseña de las cuentas de demostración}';

    protected $description = 'Mide p50/p95 de los endpoints principales con los datos de simulación.';

    /** Objetivos del Documento General (sección 8): páginas comunes y búsquedas complejas. */
    private const TARGET_PAGE_MS = 3000;

    private const TARGET_SEARCH_MS = 5000;

    /** @var array<string, PendingRequest> */
    private array $sessions = [];

    public function handle(): int
    {
        if (! $this->simulationAllowed()) {
            return self::FAILURE;
        }
        $password = (string) $this->option('password');
        if ($password === '') {
            $this->error('Indica --password con la contraseña de las cuentas de demostración.');

            return self::FAILURE;
        }
        $repeat = max(1, (int) $this->option('repeat'));

        $rows = [];
        $searchTurn = 0;
        foreach (SimulationScenarios::build() as $scenario) {
            $samples = [];
            $statuses = [];
            $bytes = 0;
            for ($i = 0; $i < $repeat + 2; $i++) {
                // El buscador permite 60 consultas por minuto y cuenta: se alternan las cuentas COMPANY.
                $emails = (array) $scenario['email'];
                $email = $emails[$searchTurn++ % count($emails)];
                $client = $this->session($email, $password);
                $started = hrtime(true);
                $response = $client->get($scenario['path']);
                $elapsed = (hrtime(true) - $started) / 1e6;
                if ($i < 2) {
                    continue;
                }
                $samples[] = $elapsed;
                $statuses[$response->status()] = ($statuses[$response->status()] ?? 0) + 1;
                $bytes = strlen($response->body());
            }
            sort($samples);
            $target = $scenario['search'] ? self::TARGET_SEARCH_MS : self::TARGET_PAGE_MS;
            $p95 = $this->percentile($samples, 0.95);
            $rows[] = [
                $scenario['role'], $scenario['label'],
                implode(' ', array_map(fn ($status, $count) => $count === $repeat ? (string) $status : "{$status}×{$count}", array_keys($statuses), $statuses)),
                number_format($this->percentile($samples, 0.5), 1), number_format($p95, 1), number_format(end($samples), 1),
                $this->size($bytes), $p95 <= $target ? 'Sí' : 'NO',
            ];
            $this->line(sprintf('  %-11s %-45s p95 %8.1f ms', $scenario['role'], $scenario['label'], $p95));
        }

        $headers = ['Rol', 'Escenario', 'HTTP', 'p50 ms', 'p95 ms', 'Máx ms', 'Tamaño', 'Objetivo'];
        $this->newLine();
        $this->table($headers, $rows);

        $markdown = "# Tiempos por endpoint — simulación de carga\n\n".
            sprintf("Generado el %s con %d repeticiones por endpoint (más 2 de calentamiento), peticiones secuenciales contra `php artisan serve` con `APP_DEBUG=false`. Objetivo: p95 ≤ %d ms en páginas y ≤ %d ms en búsquedas.\n\n", now()->toDateTimeString(), $repeat, self::TARGET_PAGE_MS, self::TARGET_SEARCH_MS).
            '| '.implode(' | ', $headers)." |\n|".str_repeat(' --- |', count($headers))."\n".
            implode("\n", array_map(fn (array $row) => '| '.implode(' | ', $row).' |', $rows))."\n";
        $this->info('Informe guardado en '.SimulationReport::save('benchmark', $markdown));

        return self::SUCCESS;
    }

    /** Sesión de la SPA: cookie CSRF, login con X-XSRF-TOKEN y la misma cookie en adelante. */
    private function session(string $email, string $password): PendingRequest
    {
        if (isset($this->sessions[$email])) {
            return $this->sessions[$email];
        }
        $jar = new CookieJar;
        $origin = (string) $this->option('origin');
        $client = Http::baseUrl((string) $this->option('url'))
            ->withOptions(['cookies' => $jar])
            ->withHeaders(['Origin' => $origin, 'Referer' => $origin.'/', 'Accept' => 'application/json'])
            ->timeout(60);

        $client->get('/sanctum/csrf-cookie')->throw();
        $token = urldecode((string) $jar->getCookieByName('XSRF-TOKEN')?->getValue());
        $client->withHeaders(['X-XSRF-TOKEN' => $token])->post('/api/login', ['email' => $email, 'password' => $password])->throw();

        return $this->sessions[$email] = $client;
    }

    private function percentile(array $sorted, float $quantile): float
    {
        return $sorted[(int) max(0, ceil($quantile * count($sorted)) - 1)];
    }

    private function size(int $bytes): string
    {
        return $bytes >= 1024 ? number_format($bytes / 1024, 1).' KB' : $bytes.' B';
    }
}
