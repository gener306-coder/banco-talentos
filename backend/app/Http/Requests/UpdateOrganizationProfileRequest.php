<?php

namespace App\Http\Requests;

use App\Enums\EconomicSector;
use App\Enums\MexicanState;
use App\Enums\UserRole;
use App\Models\Institution;
use App\Rules\PhoneNumber;
use App\Rules\Rfc;
use App\Rules\WorkCenterKey;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Perfil de la organización de la sesión (HU-S14-03). Lista explícita de campos por rol:
 * - la empresa captura y corrige todo su perfil (M1 a M4): todo opcional, solo se valida el formato de lo capturado y
 *   un texto vacío se guarda como null. `account_name` actualiza además el nombre de la cuenta de la sesión;
 * - la institución, su nombre oficial, su CCT y el contacto de su programa dual (T-S14-15, las mismas reglas que la
 *   empresa: corrige sus datos y `account_name` con «Soy yo»). Desde HU-S16-07 también es opcional (guardado parcial
 *   del onboarding); el mínimo se exige al operar (HU-S16-08).
 * Los ids, el folio de validación, el estado, la autoría y cualquier otro campo se rechazan por nombre.
 */
class UpdateOrganizationProfileRequest extends FormRequest
{
    private const CONTACT = ['contact_name', 'contact_position', 'contact_email', 'contact_phone'];

    private const COMPANY = ['trade_name', 'legal_name', 'rfc', 'sector_code', 'state_code', 'municipality_code', ...self::CONTACT, 'account_name'];

    private const INSTITUTION = ['name', 'cct', ...self::CONTACT, 'account_name'];

    private const TEXT = ['trade_name', 'legal_name', 'rfc', 'sector_code', 'state_code', 'municipality_code', 'name', 'cct', ...self::CONTACT, 'account_name'];

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
        return $this->isCompany() ? self::COMPANY : self::INSTITUTION;
    }

    protected function prepareForValidation(): void
    {
        // Un texto vacío es un dato no capturado: viaja como null.
        $clean = [];
        foreach (self::TEXT as $field) {
            if (is_string($this->input($field))) {
                $clean[$field] = trim($this->input($field)) === '' ? null : trim($this->input($field));
            }
        }
        if (isset($clean['rfc'])) {
            $clean['rfc'] = Rfc::normalize($clean['rfc']);
        }
        if (isset($clean['cct']) && ! $this->isCompany()) {
            $clean['cct'] = WorkCenterKey::normalizeAgainst($clean['cct'], Institution::query()->whereKey($this->user()->institution_id)->value('cct'));
        }
        if (isset($clean['contact_email'])) {
            $clean['contact_email'] = Str::lower($clean['contact_email']);
        }
        $this->merge($clean);
    }

    public function rules(): array
    {
        if (! $this->isCompany()) {
            // HU-S16-07: todo opcional, como en la empresa; el formato del CCT solo se exige si cambia (T-S14-15).
            $institution = $this->user()->institution_id;

            return [
                'name' => ['nullable', 'string', 'max:255'],
                'cct' => ['bail', 'nullable', 'string',
                    new WorkCenterKey(Institution::query()->whereKey($institution)->value('cct')),
                    Rule::unique('institutions', 'cct')->ignore($institution)],
                'account_name' => ['nullable', 'string', 'max:120'],
                'contact_name' => ['nullable', 'string', 'max:120'],
                'contact_position' => ['nullable', 'string', 'max:120'],
                'contact_email' => ['nullable', 'string', 'email', 'max:254'],
                'contact_phone' => ['nullable', 'string', 'max:20', new PhoneNumber],
            ];
        }
        $state = $this->input('state_code');

        return [
            'trade_name' => ['nullable', 'string', 'max:150'],
            'legal_name' => ['nullable', 'string', 'max:200'],
            'rfc' => ['bail', 'nullable', 'string', new Rfc, Rule::unique('companies', 'rfc')->ignore($this->user()->company_id)],
            // Sin bloqueo: la empresa puede corregir su sector cuando quiera (sustituye a D2).
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
            // Vacío o ausente conserva el nombre actual de la cuenta: un guardado parcial no lo borra.
            'account_name' => ['nullable', 'string', 'max:120'],
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
            'name.string' => 'El nombre oficial no es válido.',
            'name.max' => 'El nombre oficial no debe superar 255 caracteres.',
            'cct.string' => 'La Clave de Centro de Trabajo no es válida.',
            'cct.unique' => 'Esa Clave de Centro de Trabajo ya está registrada en otra institución.',
            'trade_name.string' => 'El nombre comercial no es válido.',
            'trade_name.max' => 'El nombre comercial no debe superar 150 caracteres.',
            'legal_name.string' => 'La razón social no es válida.',
            'legal_name.max' => 'La razón social no debe superar 200 caracteres.',
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
            'account_name.string' => 'Tu nombre no es válido.',
            'account_name.max' => 'Tu nombre no debe superar 120 caracteres.',
        ];
    }
}
