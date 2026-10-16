<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Clave normalizada de un término del catálogo (habilidades, emisores): minúsculas, sin acentos y con
 * espacios simples. Conserva símbolos como «#», «+» y «.», para que «C#», «C++» y «Node.js» no colapsen.
 */
final class CatalogSlug
{
    public static function displayName(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    }

    public static function from(string $value): string
    {
        return Str::lower(Str::ascii(self::displayName($value)));
    }
}
