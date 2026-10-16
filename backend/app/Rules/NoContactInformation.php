<?php

namespace App\Rules;

use App\Support\ContactInformation;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Rechaza URLs, correos y teléfonos en un campo público del CV (HU-S3-01 CA-02). */
class NoContactInformation implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && ContactInformation::present($value)) {
            $fail(ContactInformation::MESSAGE);
        }
    }
}
