<?php

namespace App\Support;

use App\Enums\SkillKind;
use RuntimeException;

/**
 * Catálogo semilla de habilidades (HU-S10-01), versionado en el repositorio.
 * Ver database/data/skills/README.md: criterios de curaduría y cómo regenerarlo.
 */
final class SkillSeedCatalog
{
    private const HEADER = ['name', 'kind', 'aliases'];

    public static function path(): string
    {
        return database_path('data/skills/top_skills.csv');
    }

    /**
     * Renglones validados del archivo, en su orden. Un renglón inválido o un slug repetido detienen la carga
     * antes de escribir nada. Los alias van separados por «|» y se normalizan como un slug; un mismo alias
     * puede apuntar a varias habilidades.
     *
     * @return list<array{name: string, slug: string, kind: string, aliases: list<string>}>
     */
    public static function rows(?string $path = null): array
    {
        $path ??= self::path();
        $handle = is_readable($path) ? fopen($path, 'r') : false;
        if ($handle === false) {
            throw new RuntimeException("No se pudo abrir el catálogo de habilidades: {$path}.");
        }

        try {
            if (fgetcsv($handle, escape: '') !== self::HEADER) {
                throw new RuntimeException('El encabezado del catálogo de habilidades no es «name,kind,aliases».');
            }

            $rows = [];
            $slugs = [];
            $line = 1;
            while (($fields = fgetcsv($handle, escape: '')) !== false) {
                $line++;
                $name = CatalogSlug::displayName((string) ($fields[0] ?? ''));
                $kind = (string) ($fields[1] ?? '');

                if (count($fields) !== 3 || $name === '' || mb_strlen($name) > 80 || SkillKind::tryFrom($kind) === null) {
                    throw new RuntimeException("Renglón {$line} inválido en el catálogo de habilidades.");
                }
                $slug = CatalogSlug::from($name);
                $aliases = array_values(array_unique(array_filter(
                    array_map(CatalogSlug::from(...), explode('|', (string) $fields[2])),
                    fn (string $alias): bool => $alias !== '' && $alias !== $slug,
                )));
                if (array_filter($aliases, fn (string $alias): bool => mb_strlen($alias) > 80) !== []) {
                    throw new RuntimeException("Renglón {$line}: un alias supera 80 caracteres.");
                }
                if (isset($slugs[$slug])) {
                    throw new RuntimeException("Renglón {$line}: «{$name}» repite la habilidad del renglón {$slugs[$slug]}.");
                }

                $slugs[$slug] = $line;
                $rows[] = ['name' => $name, 'slug' => $slug, 'kind' => $kind, 'aliases' => $aliases];
            }
        } finally {
            fclose($handle);
        }

        return $rows;
    }
}
