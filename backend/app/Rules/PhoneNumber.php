<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Teléfono de contacto (HU-S4-02, T-S8-11): dígitos con espacios, paréntesis, guiones y un «+» inicial, y entre 10 y
 * 15 dígitos, para admitir números nacionales e internacionales sin imponer un formato.
 */
class PhoneNumber implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! preg_match('/^\+?[\d\s().-]+$/', $value)) {
            $fail('El teléfono solo admite dígitos, espacios, paréntesis, guiones y un “+” inicial.');

            return;
        }
        $digits = strlen(preg_replace('/\D/', '', $value));
        if ($digits < 10 || $digits > 15) {
            $fail('El teléfono debe tener entre 10 y 15 dígitos.');
        }
    }
}
