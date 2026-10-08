<?php

namespace App\Http\Requests\Concerns;

use Closure;

/**
 * Política de contraseña de las cuentas institucionales, compartida por la
 * configuración inicial y el restablecimiento.
 */
trait InstitutionPasswordRules
{
    protected function passwordRules(): array
    {
        return [
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

    protected function passwordMessages(): array
    {
        return [
            'password.required' => 'La contraseña es obligatoria.',
            'password.string' => 'Ingresa una contraseña válida.',
            'password.min' => 'La contraseña debe tener al menos 12 caracteres.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password_confirmation.required' => 'Confirma la contraseña.',
        ];
    }
}
