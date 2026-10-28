<?php

namespace App\Rules;

use App\Support\ContactInformation;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Rechaza URLs, correos y teléfonos en un campo público: CV (HU-S3-01 CA-02) y oportunidades duales (HU-S5-02 CA-04),
 * cada uno con su mensaje.
 */
class NoContactInformation implements ValidationRule
{
    public function __construct(private readonly string $message = ContactInformation::MESSAGE) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && ContactInformation::present($value)) {
            $fail($this->message);
        }
    }
}
