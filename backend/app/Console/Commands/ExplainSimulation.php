<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\GuardsSimulation;
use App\Models\User;
use App\Support\Simulation\SimulationReport;
use App\Support\Simulation\SimulationScenarios;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Ejecuta los escenarios de la simulación dentro del proceso, captura las consultas reales que genera cada uno y
 * guarda el EXPLAIN (ANALYZE, BUFFERS) de las más lentas, marcando lecturas secuenciales de tablas grandes y
 * ordenamientos en disco.
 */
class ExplainSimulation extends Command
{
    use GuardsSimulation;

    protected $signature = 'simulation:explain {--top=3 : Consultas más lentas analizadas por escenario}';

    protected $description = 'Analiza los planes de las consultas más lentas de cada escenario de la simulación.';

    private const LARGE_TABLE_ROWS = 10000;

    public function handle(): int
    {
        if (! $this->simulationAllowed()) {
            return self::FAILURE;
        }
        $top = max(1, (int) $this->option('top'));
        $sizes = collect(DB::select("SELECT relname, reltuples::bigint AS rows FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace"))
            ->pluck('rows', 'relname');

        $captured = [];
        DB::listen(function (QueryExecuted $query) use (&$captured): void {
            $captured[] = ['sql' => $query->sql, 'bindings' => $query->bindings, 'time' => $query->time];
        });

        $sections = [];
        $warnings = [];
        foreach (SimulationScenarios::build(1) as $scenario) {
            $user = User::query()->where('email', ((array) $scenario['email'])[0])->firstOrFail();
            app('auth')->forgetGuards();
            app('auth')->guard('web')->setUser($user);

            $captured = [];
            $response = app(Kernel::class)->handle(Request::create($scenario['path'], 'GET', server: ['HTTP_ACCEPT' => 'application/json']));
            if ($response instanceof StreamedResponse) {
                ob_start();
                $response->sendContent();
                ob_end_clean();
            }
            $queries = collect($captured)
                ->reject(fn (array $query) => preg_match('/^(select \* from "users" where "id"|select \* from "sessions"|insert into "cache"|select \* from "cache")/i', $query['sql']))
                ->unique('sql')
                ->sortByDesc('time')
                ->take($top);

            $section = "## {$scenario['role']} — {$scenario['label']}\n\n`GET {$scenario['path']}` → HTTP {$response->getStatusCode()}, ".count($captured)." consultas.\n";
            foreach ($queries as $query) {
                DB::beginTransaction();
                try {
                    $plan = implode("\n", array_map(fn ($row) => $row->{'QUERY PLAN'}, DB::select('EXPLAIN (ANALYZE, BUFFERS) '.$query['sql'], $query['bindings'])));
                } finally {
                    DB::rollBack();
                }
                $flags = [];
                preg_match_all('/Seq Scan on (\w+)/', $plan, $scans);
                foreach (array_unique($scans[1]) as $table) {
                    if (($sizes[$table] ?? 0) > self::LARGE_TABLE_ROWS) {
                        $flags[] = "lectura secuencial de `{$table}` (".number_format($sizes[$table]).' filas)';
                    }
                }
                if (str_contains($plan, 'external merge') || str_contains($plan, 'Disk:')) {
                    $flags[] = 'ordenamiento o hash en disco';
                }
                preg_match('/Execution Time: ([\d.]+) ms/', $plan, $execution);
                $label = sprintf('%.1f ms', (float) ($execution[1] ?? $query['time']));
                if ($flags !== []) {
                    $warnings[] = "- **{$scenario['role']} — {$scenario['label']}** ({$label}): ".implode('; ', $flags);
                }
                $section .= "\n### {$label}".($flags === [] ? '' : ' — ⚠ '.implode('; ', $flags))."\n\n```sql\n".$query['sql']."\n```\n\n```text\n{$plan}\n```\n";
            }
            $sections[] = $section;
            $this->line(sprintf('  %-11s %-45s %d consultas', $scenario['role'], $scenario['label'], count($captured)));
        }

        $markdown = "# Planes de consulta — simulación de carga\n\nGenerado el ".now()->toDateTimeString().". Las {$top} consultas más lentas de cada escenario, con `EXPLAIN (ANALYZE, BUFFERS)` dentro de una transacción revertida.\n\n".
            "## Señales\n\n".($warnings === [] ? 'Ninguna lectura secuencial de tablas de más de '.number_format(self::LARGE_TABLE_ROWS)." filas ni ordenamientos en disco.\n" : implode("\n", array_unique($warnings))."\n").
            "\n".implode("\n", $sections);
        $this->newLine();
        $this->info(count($warnings).' señales. Informe guardado en '.SimulationReport::save('explain', $markdown));

        return self::SUCCESS;
    }
}
