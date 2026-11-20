<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Clave de Centro de Trabajo de la SEP (T-S14-15): 10 caracteres, los 2 dígitos de la entidad (01 a 32), 3 letras del
 * tipo de centro, 4 dígitos y 1 letra verificadora. Se compara en mayúsculas y sin espacios ni guiones.
 *
 * `$current`: el CCT ya registrado. Uno anterior a esta regla que no cumpla el formato sigue siendo válido mientras no
 * cambie; solo un CCT nuevo debe cumplirlo.
 */
class WorkCenterKey implements ValidationRule
{
    public const MESSAGE = 'La CCT debe tener 10 caracteres: 2 dígitos de la entidad, 3 letras, 4 dígitos y 1 letra, p. ej. 28EUT0001A.';

    public function __construct(private readonly ?string $current = null) {}

    public static function normalize(mixed $value): mixed
    {
        return is_string($value) ? mb_strtoupper((string) preg_replace('/[\s-]+/u', '', $value)) : $value;
    }

    /**
     * Normaliza lo escrito, salvo que equivalga al CCT ya registrado: entonces se conserva tal cual, para que un CCT
     * anterior a la regla (con guiones o minúsculas) no cambie solo por guardar otros datos.
     */
    public static function normalizeAgainst(mixed $value, ?string $current): mixed
    {
        if ($current !== null && is_string($value) && self::normalize($value) === self::normalize($current)) {
            return $current;
        }

        return self::normalize($value);
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($this->current !== null && $value === $this->current) {
            return;
        }
        if (! is_string($value) || ! preg_match('/^(0[1-9]|[12]\d|3[0-2])[A-Z]{3}\d{4}[A-Z]$/', $value)) {
            $fail(self::MESSAGE);
        }
    }
}
