<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ResendSecretarySetupLinkRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol (ADMIN o SECRETARY) lo garantiza el middleware de la ruta.
        return true;
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
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'El correo de la cuenta pendiente es obligatorio.',
            'email.string' => 'Ingresa un correo electrónico válido.',
            'email.email' => 'Ingresa un correo electrónico válido.',
            'email.max' => 'El correo electrónico no debe superar 254 caracteres.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
        ];
    }
}
