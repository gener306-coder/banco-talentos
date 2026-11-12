<?php

namespace App\Console\Commands;

use App\Models\Skill;
use App\Support\SkillSeedCatalog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Carga el catálogo semilla de habilidades (HU-S10-01). No corre en una migración (CA-03): las pruebas parten
 * de un catálogo vacío y el catálogo es abierto, así que la semilla se aplica en cada entorno tras migrar.
 */
class SeedSkills extends Command
{
    protected $signature = 'skills:seed {--path= : CSV alterno con cabecera name,kind,aliases}';

    protected $description = 'Carga el catálogo semilla de habilidades: agrega las nuevas y actualiza el tipo y los alias de las existentes.';

    private const CHUNK = 500;

    public function handle(): int
    {
        try {
            $rows = SkillSeedCatalog::rows($this->option('path') ?: null);
        } catch (RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        // Todo o nada (CA-02): un fallo a media carga no deja el catálogo con tipos o alias a medias.
        [$added, $updated] = DB::transaction(function () use ($rows): array {
            $added = $updated = 0;
            foreach (array_chunk($rows, self::CHUNK) as $chunk) {
                $existing = Skill::query()->whereIn('slug', array_column($chunk, 'slug'))->lockForUpdate()->get()->keyBy('slug');

                $new = [];
                foreach ($chunk as $row) {
                    $skill = $existing->get($row['slug']);
                    if ($skill === null) {
                        $new[] = [...$row, 'aliases' => json_encode($row['aliases']), 'created_at' => now(), 'updated_at' => now()];
                    } elseif ($skill->kind->value !== $row['kind'] || $skill->aliases !== $row['aliases']) {
                        // El catálogo curado fija el tipo y los alias; el nombre es de quien la registró primero.
                        $skill->forceFill(['kind' => $row['kind'], 'aliases' => $row['aliases']])->save();
                        $updated++;
                    }
                }
                // insertOrIgnore: otra cuenta pudo registrar la misma habilidad entre la lectura y la escritura.
                $added += Skill::query()->insertOrIgnore($new);
            }

            return [$added, $updated];
        });

        $this->info(sprintf(
            'Catálogo semilla: %d habilidades; %d agregadas, %d actualizadas, %d sin cambios.',
            count($rows), $added, $updated, count($rows) - $added - $updated,
        ));

        return self::SUCCESS;
    }
}
