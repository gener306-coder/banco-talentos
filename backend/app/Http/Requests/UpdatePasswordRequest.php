<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\InstitutionPasswordRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Validator;

/**
 * Cambio de la contraseña propia (HU-S14-01 CA-03): exige la contraseña actual y aplica la política existente. La nueva
 * debe ser distinta de la actual. Cualquier otro campo se rechaza.
 */
class UpdatePasswordRequest extends FormRequest
{
    use InstitutionPasswordRules;

    private const ALLOWED = ['current_password', 'password', 'password_confirmation'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['current_password' => ['required', 'string', 'max:1024'], ...$this->passwordRules()];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), self::ALLOWED) as $field) {
                $validator->errors()->add($field, 'Este dato no se puede cambiar desde tu cuenta.');
            }
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            $user = $this->user();
            if (! Hash::check((string) $this->input('current_password'), $user->password)) {
                $validator->errors()->add('current_password', 'La contraseña actual no es correcta.');
            } elseif (Hash::check((string) $this->input('password'), $user->password)) {
                $validator->errors()->add('password', 'La contraseña nueva debe ser distinta de la actual.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'current_password.required' => 'Escribe tu contraseña actual.',
            'current_password.string' => 'La contraseña actual no es válida.',
            'current_password.max' => 'La contraseña actual no es válida.',
            ...$this->passwordMessages(),
        ];
    }
}
