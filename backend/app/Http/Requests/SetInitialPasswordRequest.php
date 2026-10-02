<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class SetInitialPasswordRequest extends FormRequest
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
            'email' => ['required', 'string', 'email', 'max:254'],
            'token' => ['bail', 'required', 'string', 'size:64', 'regex:/\\A[a-f0-9]{64}\\z/'],
            'password' => [
                'bail', 'required', 'string', 'min:12', 'confirmed',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (strlen($value) > 72) {
                        $fail('La contraseña no debe superar 72 bytes.');
                    }
                    if (str_contains($value, "\0")) {
                        $fail('La contraseña contiene un carácter no permitido.');
                    }
                },
            ],
            'password_confirmation' => ['required', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'El enlace de configuración no es válido.',
            'email.email' => 'El enlace de configuración no es válido.',
            'token.*' => 'El enlace de configuración no es válido o ha expirado.',
            'password.required' => 'La contraseña es obligatoria.',
            'password.string' => 'Ingresa una contraseña válida.',
            'password.min' => 'La contraseña debe tener al menos 12 caracteres.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password_confirmation.required' => 'Confirma la contraseña.',
        ];
    }
}
