<?php

namespace App\Support;

use App\Models\Skill;
use Illuminate\Support\Collection;

/**
 * Catálogo abierto y compartido de habilidades (HU-S3-01), usado por el CV del alumno y por las oportunidades
 * duales (HU-S5-02).
 */
final class SkillCatalog
{
    /**
     * Normaliza la lista enviada: nombre con espacios simples y slug. Una habilidad repetida (con otras mayúsculas
     * o acentos) se conserva una sola vez, en su primera posición.
     *
     * @param  array<int, array{name: string, kind: string}>  $skills
     * @return Collection<int, array{name: string, slug: string, kind: string}>
     */
    public static function normalize(array $skills): Collection
    {
        return collect($skills)
            ->map(fn (array $skill): array => [
                'name' => CatalogSlug::displayName($skill['name']),
                'slug' => CatalogSlug::from($skill['name']),
                'kind' => $skill['kind'],
            ])
            ->unique('slug')
            ->values();
    }

    /**
     * Id del catálogo para cada slug. Las nuevas se insertan sin pisar las existentes: el tipo y el nombre
     * los fija quien la registró primero, también si dos cuentas la crean a la vez.
     *
     * @return array<string, int>
     */
    public static function ids(Collection $skills): array
    {
        if ($skills->isEmpty()) {
            return [];
        }
        Skill::query()->insertOrIgnore($skills->map(fn (array $skill): array => [
            ...$skill, 'created_at' => now(), 'updated_at' => now(),
        ])->all());

        return Skill::query()->whereIn('slug', $skills->pluck('slug'))->pluck('id', 'slug')->all();
    }
}
