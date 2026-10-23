<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * RFC del SAT (HU-S4-02 CA-03): persona moral (3 letras) o física (4 letras), fecha AAMMDD válida y homoclave
 * de 3 caracteres. Se compara en mayúsculas. Los RFC genéricos (público en general y extranjeros) no identifican
 * a una empresa y se rechazan. No se verifica el dígito de la homoclave: un algoritmo distinto al del SAT
 * rechazaría RFC reales.
 */
class Rfc implements ValidationRule
{
    private const GENERIC = ['XAXX010101000', 'XEXX010101000'];

    public static function normalize(mixed $value): mixed
    {
        return is_string($value) ? mb_strtoupper(trim($value)) : $value;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! preg_match('/^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{3})$/u', $value, $parts)
            || ! checkdate((int) $parts[3], (int) $parts[4], 2000 + (int) $parts[2])
            || in_array($value, self::GENERIC, true)) {
            $fail('El RFC no es válido: 12 caracteres para persona moral o 13 para persona física.');
        }
    }
}
