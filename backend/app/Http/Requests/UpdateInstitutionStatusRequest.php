<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;

class UpdateInstitutionStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === UserRole::ADMIN;
    }

    public function rules(): array
    {
        return [
            'is_active' => ['required', 'boolean:strict'],
            'name' => ['missing'],
            'cct' => ['missing'],
            'contact_email' => ['missing'],
        ];
    }

    public function messages(): array
    {
        return [
            'is_active.required' => 'El estado es obligatorio.',
            'is_active.boolean' => 'El estado debe ser true o false.',
            '*.missing' => 'La acción de cambio de estado solo permite modificar is_active.',
        ];
    }
}
