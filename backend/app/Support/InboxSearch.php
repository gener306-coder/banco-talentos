<?php

namespace App\Support;

/**
 * Palabras del buscador de las bandejas de solicitudes (T-S13-09). Cada palabra debe aparecer en algún campo; la
 * búsqueda es literal (% y _ no son comodines) y la base la normaliza con talent_search_text(), sin acentos ni
 * mayúsculas. Se descartan las repetidas y se procesan como máximo MAX_WORDS para acotar las subconsultas.
 */
final class InboxSearch
{
    public const MAX_LENGTH = 100;

    public const MAX_WORDS = 8;

    /** @return list<string> patrones LIKE ya escapados, uno por palabra única */
    public static function patterns(?string $query): array
    {
        $words = preg_split('/\s+/u', mb_strtolower(trim((string) $query)), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_map(
            fn (string $word): string => '%'.addcslashes($word, '\\%_').'%',
            array_slice(array_values(array_unique($words)), 0, self::MAX_WORDS),
        );
    }

    /** Condición SQL de una columna contra un patrón, ambos normalizados. */
    public static function matches(string $column): string
    {
        return "talent_search_text({$column}) LIKE talent_search_text(?)";
    }
}
