<?php

namespace App\Http\Requests;

use App\Enums\InsuranceType;
use App\Support\SocialSecurityNumber;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStudentSocialSecurityRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del alumno, el controlador.
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (! $this->has('insurance_type')) {
            $this->merge(['insurance_type' => InsuranceType::IMSS->value]);
        }
        if (is_string($this->input('nss'))) {
            $this->merge(['nss' => SocialSecurityNumber::normalize($this->input('nss'))]);
        }
    }

    public function rules(): array
    {
        return [
            'insurance_type' => ['required', Rule::enum(InsuranceType::class)],
            // Solo se conserva lo del tipo elegido. El controlador exige el NSS si tampoco hay comprobante.
            'nss' => [
                'exclude_unless:insurance_type,IMSS', 'nullable', 'string', 'regex:/^\d{11}$/',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! SocialSecurityNumber::isValid($value)) {
                        $fail('El dígito verificador del NSS no es válido. Revisa que esté bien escrito.');
                    }
                },
            ],
            'insurer_name' => ['exclude_unless:insurance_type,OTHER', 'required', 'string', 'max:120'],
            'policy_number' => ['exclude_unless:insurance_type,OTHER', 'nullable', 'string', 'max:40', 'regex:/^[\p{L}\p{N}][\p{L}\p{N} .\/-]*$/u'],
        ];
    }

    public function messages(): array
    {
        return [
            'insurance_type.required' => 'Selecciona el tipo de seguro.',
            'insurance_type.enum' => 'El tipo de seguro no es válido.',
            'nss.string' => 'El NSS no es válido.',
            'nss.regex' => 'El NSS debe tener 11 dígitos.',
            'insurer_name.required' => 'El nombre de la aseguradora es obligatorio.',
            'insurer_name.string' => 'El nombre de la aseguradora no es válido.',
            'insurer_name.max' => 'El nombre de la aseguradora no debe superar 120 caracteres.',
            'policy_number.string' => 'El número del seguro no es válido.',
            'policy_number.max' => 'El número del seguro no debe superar 40 caracteres.',
            'policy_number.regex' => 'El número del seguro solo admite letras, dígitos, espacios, puntos, guiones y diagonales.',
        ];
    }
}
