<?php

namespace App\Http\Requests;

use App\Enums\EconomicSector;
use App\Enums\MexicanState;
use App\Rules\Rfc;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Alta y edición de una empresa (HU-S4-02 CA-02 a CA-05). Sin coordenadas, estado activo ni registrante:
 * esos los asigna el servidor y cualquier valor enviado queda fuera de validated().
 */
class CompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol SECRETARY lo garantiza el middleware de la ruta.
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(array_filter([
            'rfc' => Rfc::normalize($this->input('rfc')),
            'contact_email' => is_string($this->input('contact_email')) ? Str::lower(trim($this->input('contact_email'))) : null,
        ], fn ($value) => $value !== null));
    }

    public function rules(): array
    {
        $state = $this->input('state_code');

        return [
            'legal_name' => ['required', 'string', 'max:200'],
            'trade_name' => ['nullable', 'string', 'max:150'],
            'rfc' => ['bail', 'required', 'string', new Rfc, Rule::unique('companies', 'rfc')->ignore($this->route('company'))],
            'sector_code' => ['required', 'string', Rule::enum(EconomicSector::class)],
            'state_code' => ['required', 'string', Rule::enum(MexicanState::class)],
            'municipality_code' => [
                'required', 'string', 'regex:/^\d{5}$/',
                Rule::exists('municipalities', 'code')->where('state_code', is_string($state) ? $state : ''),
            ],
            'contact_name' => ['required', 'string', 'max:120'],
            'contact_email' => ['required', 'string', 'email', 'max:254'],
            'contact_phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[\d\s().-]+$/', function (string $attribute, mixed $value, Closure $fail): void {
                $digits = strlen(preg_replace('/\D/', '', (string) $value));
                if ($digits < 10 || $digits > 15) {
                    $fail('El teléfono debe tener entre 10 y 15 dígitos.');
                }
            }],
            'validation_reference' => ['nullable', 'string', 'max:60'],
        ];
    }

    public function messages(): array
    {
        return [
            'legal_name.required' => 'La razón social es obligatoria.',
            'legal_name.string' => 'La razón social no es válida.',
            'legal_name.max' => 'La razón social no debe superar 200 caracteres.',
            'trade_name.string' => 'El nombre comercial no es válido.',
            'trade_name.max' => 'El nombre comercial no debe superar 150 caracteres.',
            'rfc.required' => 'El RFC es obligatorio.',
            'rfc.string' => 'El RFC no es válido: 12 caracteres para persona moral o 13 para persona física.',
            'rfc.unique' => 'Ya existe una empresa registrada con ese RFC.',
            'sector_code.required' => 'El sector económico es obligatorio.',
            'sector_code.string' => 'El sector económico no es válido.',
            'sector_code.enum' => 'El sector económico no es válido.',
            'state_code.required' => 'El estado es obligatorio.',
            'state_code.string' => 'El estado no es válido.',
            'state_code.enum' => 'El estado no es válido.',
            'municipality_code.required' => 'El municipio es obligatorio.',
            'municipality_code.string' => 'El municipio no es válido.',
            'municipality_code.regex' => 'El municipio no es válido.',
            'municipality_code.exists' => 'El municipio no pertenece al estado seleccionado.',
            'contact_name.required' => 'El nombre del contacto es obligatorio.',
            'contact_name.string' => 'El nombre del contacto no es válido.',
            'contact_name.max' => 'El nombre del contacto no debe superar 120 caracteres.',
            'contact_email.required' => 'El correo del contacto es obligatorio.',
            'contact_email.string' => 'Ingresa un correo de contacto válido.',
            'contact_email.email' => 'Ingresa un correo de contacto válido.',
            'contact_email.max' => 'El correo del contacto no debe superar 254 caracteres.',
            'contact_phone.string' => 'El teléfono no es válido.',
            'contact_phone.max' => 'El teléfono no debe superar 20 caracteres.',
            'contact_phone.regex' => 'El teléfono solo admite dígitos, espacios, paréntesis, guiones y un «+» inicial.',
            'validation_reference.string' => 'El folio de validación no es válido.',
            'validation_reference.max' => 'El folio de validación no debe superar 60 caracteres.',
        ];
    }
}
