<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use App\Rules\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreInstitutionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === UserRole::ADMIN;
    }

    /** El correo de contacto también es el de inicio de sesión de la cuenta (T-S8-11): se compara sin mayúsculas. */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('contact_email'))) {
            $this->merge(['contact_email' => Str::lower(trim($this->input('contact_email')))]);
        }
    }

    /**
     * T-S8-11: registrar la institución crea la cuenta de su responsable con el correo de contacto, así que el correo no
     * puede pertenecer a otra cuenta. El nombre y el puesto del responsable se guardan en la institución; el enlace se
     * envía por correo o se genera para compartirlo (HU-S2-01).
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'cct' => ['required', 'string', 'max:255', Rule::unique('institutions', 'cct')],
            'contact_name' => ['required', 'string', 'max:120'],
            'contact_position' => ['nullable', 'string', 'max:120'],
            'contact_email' => ['required', 'string', 'email', 'max:254', 'unique:users,email'],
            'contact_phone' => ['nullable', 'string', 'max:20', new PhoneNumber],
            'is_active' => ['missing'],
            // Opcional: sin valor se envía por correo.
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'name.string' => 'El nombre debe ser una cadena de texto.',
            'name.max' => 'El nombre no debe superar 255 caracteres.',
            'cct.required' => 'La Clave de Centro de Trabajo es obligatoria.',
            'cct.string' => 'La Clave de Centro de Trabajo debe ser una cadena de texto.',
            'cct.max' => 'La Clave de Centro de Trabajo no debe superar 255 caracteres.',
            'cct.unique' => 'La Clave de Centro de Trabajo ya está registrada.',
            'contact_email.required' => 'El correo de contacto es obligatorio.',
            'contact_email.string' => 'Ingresa un correo de contacto válido.',
            'contact_email.email' => 'Ingresa un correo de contacto válido.',
            'contact_email.max' => 'El correo de contacto no debe superar 254 caracteres.',
            'contact_email.unique' => 'El correo ya está registrado en otra cuenta.',
            'contact_name.required' => 'El nombre de la persona responsable es obligatorio.',
            'contact_name.string' => 'El nombre de la persona responsable no es válido.',
            'contact_name.max' => 'El nombre de la persona responsable no debe superar 120 caracteres.',
            'contact_position.string' => 'El puesto o departamento no es válido.',
            'contact_position.max' => 'El puesto o departamento no debe superar 120 caracteres.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
            'contact_phone.string' => 'El teléfono no es válido.',
            'contact_phone.max' => 'El teléfono no debe superar 20 caracteres.',
            'is_active.missing' => 'Utiliza la acción de cambio de estado para modificar is_active.',
        ];
    }
}
