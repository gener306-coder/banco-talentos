<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

/**
 * Inicio del restablecimiento de una cuenta SECRETARY o COMPANY (HU-S6-04 CA-02, CA-03): solo el correo. Quien lo
 * inicia nunca escribe ni elige la nueva contraseña.
 */
class StartAccountPasswordResetRequest extends FormRequest
{
    public function authorize(): bool
    {
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
            'password' => ['prohibited'],
            'password_confirmation' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'El correo de la cuenta es obligatorio.',
            'email.string' => 'Ingresa un correo electrónico válido.',
            'email.email' => 'Ingresa un correo electrónico válido.',
            'email.max' => 'El correo electrónico no debe superar 254 caracteres.',
            'password.prohibited' => 'No puedes establecer la contraseña de otra cuenta.',
            'password_confirmation.prohibited' => 'No puedes establecer la contraseña de otra cuenta.',
        ];
    }
}
