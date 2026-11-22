<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\Institution;
use App\Rules\PhoneNumber;
use App\Rules\WorkCenterKey;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Edición de la institución por Administración (HU-S16-06, como M4 en las empresas): todos los datos son opcionales,
 * porque la institución invitada captura su perfil al entrar. Un texto vacío se guarda como dato faltante. Editar no
 * crea cuentas ni envía enlaces; el correo de contacto no es el de inicio de sesión (T-S8-11).
 */
class UpdateInstitutionRequest extends FormRequest
{
    private const TEXT = ['name', 'cct', 'contact_name', 'contact_position', 'contact_email', 'contact_phone'];

    public function authorize(): bool
    {
        return $this->user()?->role === UserRole::ADMIN;
    }

    protected function prepareForValidation(): void
    {
        $clean = [];
        foreach (self::TEXT as $field) {
            if (is_string($this->input($field))) {
                $clean[$field] = trim($this->input($field)) === '' ? null : trim($this->input($field));
            }
        }
        if (isset($clean['contact_email'])) {
            $clean['contact_email'] = Str::lower($clean['contact_email']);
        }
        // T-S14-15: el CCT se guarda en mayúsculas y sin espacios ni guiones, igual que lo escribe la institución.
        if (isset($clean['cct'])) {
            $clean['cct'] = WorkCenterKey::normalizeAgainst($clean['cct'], $this->currentCct());
        }
        $this->merge($clean);
    }

    public function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:255'],
            // T-S14-15: el formato se exige solo a un CCT nuevo; uno anterior a la regla se conserva si no cambia.
            'cct' => ['bail', 'nullable', 'string', new WorkCenterKey($this->currentCct()),
                Rule::unique('institutions', 'cct')->ignore($this->route('institution'))],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'contact_position' => ['nullable', 'string', 'max:120'],
            'contact_email' => ['nullable', 'string', 'email', 'max:254'],
            'contact_phone' => ['nullable', 'string', 'max:20', new PhoneNumber],
            'is_active' => ['missing'],
            'delivery_method' => ['prohibited'],
        ];
    }

    protected function currentCct(): ?string
    {
        return Institution::query()->whereKey($this->route('institution'))->value('cct');
    }

    public function messages(): array
    {
        return [
            'delivery_method.prohibited' => 'Editar la institución no envía enlaces: usa “Reenviar enlace”.',
            'name.string' => 'El nombre debe ser una cadena de texto.',
            'name.max' => 'El nombre no debe superar 255 caracteres.',
            'cct.string' => 'La Clave de Centro de Trabajo debe ser una cadena de texto.',
            'cct.unique' => 'La Clave de Centro de Trabajo ya está registrada.',
            'contact_email.string' => 'Ingresa un correo de contacto válido.',
            'contact_email.email' => 'Ingresa un correo de contacto válido.',
            'contact_email.max' => 'El correo de contacto no debe superar 254 caracteres.',
            'contact_name.string' => 'El nombre de la persona responsable no es válido.',
            'contact_name.max' => 'El nombre de la persona responsable no debe superar 120 caracteres.',
            'contact_position.string' => 'El puesto o departamento no es válido.',
            'contact_position.max' => 'El puesto o departamento no debe superar 120 caracteres.',
            'contact_phone.string' => 'El teléfono no es válido.',
            'contact_phone.max' => 'El teléfono no debe superar 20 caracteres.',
            'is_active.missing' => 'Utiliza la acción de cambio de estado para modificar is_active.',
        ];
    }
}
