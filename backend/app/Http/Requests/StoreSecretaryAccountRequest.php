<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Alta de una cuenta SECRETARY (HU-S4-01 CA-01). Solo nombre, correo y método de entrega: el rol lo asigna el
 * servidor y cualquier otro campo (rol, institución, empresa) queda fuera de validated().
 */
class StoreSecretaryAccountRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:254', 'unique:users,email'],
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'name.string' => 'El nombre no es válido.',
            'name.max' => 'El nombre no debe superar 120 caracteres.',
            'email.required' => 'El correo electrónico es obligatorio.',
            'email.string' => 'Ingresa un correo electrónico válido.',
            'email.email' => 'Ingresa un correo electrónico válido.',
            'email.max' => 'El correo electrónico no debe superar 254 caracteres.',
            'email.unique' => 'El correo electrónico ya está registrado.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
        ];
    }
}
