<?php

namespace App\Support\Simulation;

use Illuminate\Support\Facades\File;

/** Informes de la simulación en backend/storage/simulation/, visibles desde el equipo y excluidos de Git. */
final class SimulationReport
{
    /** @return string ruta relativa al repositorio */
    public static function save(string $kind, string $markdown): string
    {
        $directory = base_path('storage/simulation');
        File::ensureDirectoryExists($directory);
        $name = $kind.'-'.now()->format('Y-m-d-His').'.md';
        File::put($directory.'/'.$name, $markdown);

        return 'backend/storage/simulation/'.$name;
    }
}
