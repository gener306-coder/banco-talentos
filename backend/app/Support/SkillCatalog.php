<?php

namespace App\Support;

use App\Models\Skill;
use Illuminate\Support\Collection;

/**
 * Catálogo abierto y compartido de habilidades (HU-S3-01), usado por el CV del alumno y por las oportunidades
 * duales (HU-S5-02); su autocompletar tolera errores ortográficos (T-S10-01).
 */
final class SkillCatalog
{
    /** Distancia máxima de la fase de trigramas: `q <<-> slug` = 1 − word_similarity (T-S10-01 CA-02). */
    public const TRIGRAM_MAX_DISTANCE = 0.5;

    /** Caracteres alfanuméricos mínimos para las fases difusas: con menos, los trigramas solo aportan ruido. */
    public const FUZZY_MIN_CHARACTERS = 3;

    /** La fase Levenshtein solo corre con consultas de esta longitud: compara contra el slug completo. */
    public const LEVENSHTEIN_MIN_LENGTH = 4;

    public const LEVENSHTEIN_MAX_LENGTH = 7;

    /**
     * Autocompletar en tres fases (T-S10-01); cada una corre solo si falta llenar el límite y excluye lo ya
     * encontrado.
     *  1. Prefijo literal del slug (% y _ no son comodines) o alias exacto. Resuelve 1–2 letras, símbolos
     *     («C#», «C++», que pg_trgm ignora) y abreviaturas («js»).
     *  2. Trigramas: similitud de palabra, para errores dentro de la palabra («javscript»).
     *  3. Levenshtein: letras invertidas en palabras cortas, que comparten pocos trigramas («pyhton»).
     *
     * @return Collection<int, array{id: int, name: string, kind: string, match: 'prefix'|'alias'|'fuzzy'}>
     */
    public static function search(string $query, int $limit): Collection
    {
        $slug = CatalogSlug::from($query);
        $like = addcslashes($slug, '\\%_').'%';

        // Orden: el slug exacto, luego las que coinciden por alias y luego el resto del prefijo, alfabético.
        $results = Skill::query()
            ->selectRaw('id, name, kind, (slug LIKE ?) AS by_prefix', [$like])
            ->where(fn ($skills) => $skills->where('slug', 'like', $like)
                ->orWhereRaw('aliases @> ?::jsonb', [json_encode([$slug])]))
            ->orderByRaw('(slug = ?) DESC', [$slug])
            ->orderByRaw('(slug LIKE ?) ASC', [$like])
            ->orderBy('slug')
            ->limit($limit)
            ->get()
            ->map(fn (Skill $skill): array => self::result($skill, $skill->by_prefix ? 'prefix' : 'alias'));

        if ($results->count() >= $limit || preg_match_all('/[a-z0-9]/', $slug) < self::FUZZY_MIN_CHARACTERS) {
            return $results;
        }

        $results = $results->concat(
            Skill::query()
                ->whereNotIn('id', $results->pluck('id'))
                ->whereRaw('(?::text <<-> slug) < ?', [$slug, self::TRIGRAM_MAX_DISTANCE])
                ->orderByRaw('?::text <<-> slug', [$slug])
                ->orderBy('slug')
                ->limit($limit - $results->count())
                ->get(['id', 'name', 'kind'])
                ->map(fn (Skill $skill): array => self::result($skill, 'fuzzy')),
        );

        $length = mb_strlen($slug);
        if ($results->count() >= $limit || $length < self::LEVENSHTEIN_MIN_LENGTH || $length > self::LEVENSHTEIN_MAX_LENGTH) {
            return $results->values();
        }

        // Una inversión de letras son dos ediciones. En 4–5 letras solo se admite una: con dos, «java» traería «Jira».
        $distance = $length <= 5 ? 1 : 2;

        return $results->concat(
            Skill::query()
                ->whereNotIn('id', $results->pluck('id'))
                ->whereRaw('char_length(slug) BETWEEN ? AND ?', [$length - $distance, $length + $distance])
                ->whereRaw('levenshtein_less_equal(slug, ?, ?) <= ?', [$slug, $distance, $distance])
                ->orderByRaw('levenshtein(slug, ?)', [$slug])
                ->orderBy('slug')
                ->limit($limit - $results->count())
                ->get(['id', 'name', 'kind'])
                ->map(fn (Skill $skill): array => self::result($skill, 'fuzzy')),
        )->values();
    }

    /**
     * Habilidades que nombra cada término de un filtro (HU-S11-02): las de ese slug y las que lo tienen como
     * alias. Solo coincidencias exactas, sin prefijos ni fases difusas: un filtro no adivina lo que se quiso
     * escribir; eso lo resuelve el autocompletar al capturarlo.
     *
     * @param  Collection<int, string>  $slugs  Términos ya normalizados con CatalogSlug::from().
     * @return list<list<int>> Ids por término, en el orden recibido; vacío si el término no existe.
     */
    public static function resolve(Collection $slugs): array
    {
        if ($slugs->isEmpty()) {
            return [];
        }
        $skills = Skill::query()
            ->whereIn('slug', $slugs->all())
            ->orWhere(function ($aliases) use ($slugs): void {
                foreach ($slugs as $slug) {
                    $aliases->orWhereRaw('aliases @> ?::jsonb', [json_encode([$slug])]);
                }
            })
            ->get(['id', 'slug', 'aliases']);

        return $slugs->map(fn (string $slug): array => $skills
            ->filter(fn (Skill $skill): bool => $skill->slug === $slug || in_array($slug, $skill->aliases, true))
            ->pluck('id')->all())->values()->all();
    }

    /** @return array{id: int, name: string, kind: string, match: string} */
    private static function result(Skill $skill, string $match): array
    {
        return ['id' => $skill->id, 'name' => $skill->name, 'kind' => $skill->kind->value, 'match' => $match];
    }

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
