<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ResendInstitutionSetupLinkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === UserRole::ADMIN;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => Str::lower(trim($this->input('email')))]);
        }
    }

    public function rules(): array
    {
        return [
            'email' => ['bail', 'required', 'string', 'email', 'max:254'],
            'institution_id' => [
                'bail', 'required', 'integer', 'min:1',
                Rule::exists('institutions', 'id')->where('is_active', true),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'El correo de la cuenta pendiente es obligatorio.',
            'email.email' => 'Ingresa un correo electrónico válido.',
            'email.max' => 'El correo electrónico no debe superar 254 caracteres.',
            'institution_id.required' => 'La institución es obligatoria.',
            'institution_id.integer' => 'La institución no es válida.',
            'institution_id.exists' => 'La institución no existe o no está activa.',
        ];
    }
}
