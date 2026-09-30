<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreInstitutionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === UserRole::ADMIN;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'cct' => ['required', 'string', 'max:255', Rule::unique('institutions', 'cct')],
            'contact_email' => ['required', 'string', 'email', 'max:254'],
            'is_active' => ['missing'],
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
            'is_active.missing' => 'Utiliza la acción de cambio de estado para modificar is_active.',
        ];
    }
}
