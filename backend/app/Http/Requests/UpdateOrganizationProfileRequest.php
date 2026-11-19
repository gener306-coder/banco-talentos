<?php

namespace App\Http\Requests;

use App\Enums\EconomicSector;
use App\Enums\MexicanState;
use App\Enums\UserRole;
use App\Rules\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Perfil de la organización de la sesión (HU-S14-02). Lista explícita de campos por rol: la empresa edita su nombre
 * comercial, ubicación y contacto (y establece su sector una sola vez); la institución, el contacto de su programa dual.
 * Los datos legales u oficiales (razón social, RFC, nombre oficial, CCT), los ids y cualquier otro campo se rechazan por
 * nombre, en lugar de ignorarse.
 */
class UpdateOrganizationProfileRequest extends FormRequest
{
    private const CONTACT = ['contact_name', 'contact_position', 'contact_email', 'contact_phone'];

    private const COMPANY = ['trade_name', 'state_code', 'municipality_code', 'sector_code', ...self::CONTACT];

    public function authorize(): bool
    {
        return true;
    }

    private function isCompany(): bool
    {
        return $this->user()->role === UserRole::COMPANY;
    }

    /** @return list<string> */
    public function allowed(): array
    {
        return $this->isCompany() ? self::COMPANY : self::CONTACT;
    }

    protected function prepareForValidation(): void
    {
        $trimmed = [];
        foreach (['trade_name', 'contact_name', 'contact_position', 'contact_phone'] as $field) {
            if (is_string($this->input($field))) {
                $trimmed[$field] = trim($this->input($field)) === '' ? null : trim($this->input($field));
            }
        }
        if (is_string($this->input('contact_email'))) {
            $trimmed['contact_email'] = Str::lower(trim($this->input('contact_email')));
        }
        $this->merge($trimmed);
    }

    public function rules(): array
    {
        $contact = [
            'contact_name' => ['required', 'string', 'max:120'],
            'contact_position' => ['nullable', 'string', 'max:120'],
            'contact_email' => ['required', 'string', 'email', 'max:254'],
            'contact_phone' => ['nullable', 'string', 'max:20', new PhoneNumber],
        ];
        if (! $this->isCompany()) {
            return $contact;
        }
        $state = $this->input('state_code');

        return [
            ...$contact,
            'trade_name' => ['nullable', 'string', 'max:150'],
            'state_code' => ['required', 'string', Rule::enum(MexicanState::class)],
            'municipality_code' => [
                'required', 'string', 'regex:/^\d{5}$/',
                Rule::exists('municipalities', 'code')->where('state_code', is_string($state) ? $state : ''),
            ],
            // D2: el servidor solo lo acepta mientras la empresa no tenga sector (ver OrganizationProfileController).
            'sector_code' => ['nullable', 'string', Rule::enum(EconomicSector::class)],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), $this->allowed()) as $field) {
                $validator->errors()->add($field, 'Este dato no se puede cambiar desde el perfil de la organización.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'trade_name.string' => 'El nombre comercial no es válido.',
            'trade_name.max' => 'El nombre comercial no debe superar 150 caracteres.',
            'state_code.required' => 'El estado es obligatorio.',
            'state_code.string' => 'El estado no es válido.',
            'state_code.enum' => 'El estado no es válido.',
            'municipality_code.required' => 'El municipio es obligatorio.',
            'municipality_code.string' => 'El municipio no es válido.',
            'municipality_code.regex' => 'El municipio no es válido.',
            'municipality_code.exists' => 'El municipio no pertenece al estado seleccionado.',
            'sector_code.string' => 'El sector económico no es válido.',
            'sector_code.enum' => 'El sector económico no es válido.',
            'contact_name.required' => 'El nombre del contacto es obligatorio.',
            'contact_name.string' => 'El nombre del contacto no es válido.',
            'contact_name.max' => 'El nombre del contacto no debe superar 120 caracteres.',
            'contact_position.string' => 'El puesto o departamento no es válido.',
            'contact_position.max' => 'El puesto o departamento no debe superar 120 caracteres.',
            'contact_email.required' => 'El correo del contacto es obligatorio.',
            'contact_email.string' => 'Ingresa un correo de contacto válido.',
            'contact_email.email' => 'Ingresa un correo de contacto válido.',
            'contact_email.max' => 'El correo del contacto no debe superar 254 caracteres.',
            'contact_phone.string' => 'El teléfono no es válido.',
            'contact_phone.max' => 'El teléfono no debe superar 20 caracteres.',
        ];
    }
}
