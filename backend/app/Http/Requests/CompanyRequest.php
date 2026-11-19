<?php

namespace App\Http\Requests;

use App\Enums\EconomicSector;
use App\Enums\MexicanState;
use App\Rules\PhoneNumber;
use App\Rules\Rfc;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Edición de una empresa por la Secretaría (HU-S4-02, M4 de HU-S14-02). Desde HU-S14-02 todo el perfil es opcional:
 * la empresa lo captura y la Secretaría corrige. Sin coordenadas, estado activo ni registrante: esos los asigna el
 * servidor y cualquier valor enviado queda fuera de validated().
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
        // Un texto vacío es un dato no capturado: viaja como null (HU-S14-02).
        $clean = [];
        foreach (['legal_name', 'trade_name', 'rfc', 'sector_code', 'state_code', 'municipality_code', 'contact_name', 'contact_position', 'contact_email', 'contact_phone', 'validation_reference'] as $field) {
            if (is_string($this->input($field))) {
                $clean[$field] = trim($this->input($field)) === '' ? null : trim($this->input($field));
            }
        }
        if (isset($clean['rfc'])) {
            $clean['rfc'] = Rfc::normalize($clean['rfc']);
        }
        if (isset($clean['contact_email'])) {
            $clean['contact_email'] = Str::lower($clean['contact_email']);
        }
        $this->merge($clean);
    }

    public function rules(): array
    {
        $state = $this->input('state_code');

        return [
            'legal_name' => ['nullable', 'string', 'max:200'],
            'trade_name' => ['nullable', 'string', 'max:150'],
            'rfc' => ['bail', 'nullable', 'string', new Rfc, Rule::unique('companies', 'rfc')->ignore($this->route('company'))],
            'sector_code' => ['nullable', 'string', Rule::enum(EconomicSector::class)],
            // La ubicación es completa o ninguna (CHECK companies_location_complete).
            'state_code' => ['nullable', 'required_with:municipality_code', 'string', Rule::enum(MexicanState::class)],
            'municipality_code' => [
                'nullable', 'required_with:state_code', 'string', 'regex:/^\d{5}$/',
                Rule::exists('municipalities', 'code')->where('state_code', is_string($state) ? $state : ''),
            ],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'contact_position' => ['nullable', 'string', 'max:120'],
            'contact_email' => ['nullable', 'string', 'email', 'max:254'],
            'contact_phone' => ['nullable', 'string', 'max:20', new PhoneNumber],
            'validation_reference' => ['nullable', 'string', 'max:60'],
            // La edición no crea cuentas ni envía enlaces (T-S8-12); la invitación lo hace en InviteCompanyRequest.
            'delivery_method' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'legal_name.string' => 'La razón social no es válida.',
            'legal_name.max' => 'La razón social no debe superar 200 caracteres.',
            'trade_name.string' => 'El nombre comercial no es válido.',
            'trade_name.max' => 'El nombre comercial no debe superar 150 caracteres.',
            'rfc.string' => 'El RFC no es válido: 12 caracteres para persona moral o 13 para persona física.',
            'rfc.unique' => 'Ya existe una empresa registrada con ese RFC.',
            'sector_code.string' => 'El sector económico no es válido.',
            'sector_code.enum' => 'El sector económico no es válido.',
            'state_code.required_with' => 'Elige el estado del municipio.',
            'state_code.string' => 'El estado no es válido.',
            'state_code.enum' => 'El estado no es válido.',
            'municipality_code.required_with' => 'Elige el municipio del estado.',
            'municipality_code.string' => 'El municipio no es válido.',
            'municipality_code.regex' => 'El municipio no es válido.',
            'municipality_code.exists' => 'El municipio no pertenece al estado seleccionado.',
            'contact_name.string' => 'El nombre del contacto no es válido.',
            'contact_name.max' => 'El nombre del contacto no debe superar 120 caracteres.',
            'contact_position.string' => 'El puesto o departamento no es válido.',
            'contact_position.max' => 'El puesto o departamento no debe superar 120 caracteres.',
            'contact_email.string' => 'Ingresa un correo de contacto válido.',
            'contact_email.email' => 'Ingresa un correo de contacto válido.',
            'contact_email.max' => 'El correo del contacto no debe superar 254 caracteres.',
            'contact_phone.string' => 'El teléfono no es válido.',
            'contact_phone.max' => 'El teléfono no debe superar 20 caracteres.',
            'validation_reference.string' => 'El folio de validación no es válido.',
            'validation_reference.max' => 'El folio de validación no debe superar 60 caracteres.',
            'delivery_method.prohibited' => 'Editar la empresa no envía enlaces: usa “Reenviar enlace”.',
        ];
    }
}
