<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreInstitutionAccountRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:254', 'unique:users,email'],
            'institution_id' => [
                'bail',
                'required',
                'integer',
                'min:1',
                Rule::exists('institutions', 'id')->where('is_active', true),
            ],
            // Opcional: sin valor se usa el correo (comportamiento del Sprint 1).
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'name.max' => 'El nombre no debe superar 120 caracteres.',
            'email.required' => 'El correo electrónico es obligatorio.',
            'email.email' => 'Ingresa un correo electrónico válido.',
            'email.max' => 'El correo electrónico no debe superar 254 caracteres.',
            'email.unique' => 'El correo electrónico ya está registrado.',
            'institution_id.required' => 'La institución es obligatoria.',
            'institution_id.integer' => 'La institución no es válida.',
            'institution_id.exists' => 'La institución no existe o no está activa.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
        ];
    }
}
