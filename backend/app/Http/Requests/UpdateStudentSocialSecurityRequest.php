<?php

namespace App\Http\Requests;

use App\Support\SocialSecurityNumber;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class UpdateStudentSocialSecurityRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del alumno, el controlador.
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('nss'))) {
            $this->merge(['nss' => SocialSecurityNumber::normalize($this->input('nss'))]);
        }
    }

    public function rules(): array
    {
        return [
            'nss' => [
                'required', 'string', 'regex:/^\d{11}$/',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! SocialSecurityNumber::isValid($value)) {
                        $fail('El dígito verificador del NSS no es válido. Revisa que esté bien escrito.');
                    }
                },
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'nss.required' => 'El NSS es obligatorio.',
            'nss.string' => 'El NSS no es válido.',
            'nss.regex' => 'El NSS debe tener 11 dígitos.',
        ];
    }
}
