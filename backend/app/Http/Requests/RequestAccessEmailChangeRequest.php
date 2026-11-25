<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

/** T-S19-03: correo nuevo de la persona de la sesión, con su contraseña actual como confirmación. */
class RequestAccessEmailChangeRequest extends FormRequest
{
    private const ALLOWED = ['email', 'current_password'];

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
            'current_password' => ['required', 'string', 'max:1024'],
        ];
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
            $email = (string) $this->input('email');
            if (! Hash::check((string) $this->input('current_password'), $user->password)) {
                $validator->errors()->add('current_password', 'La contraseña actual no es correcta.');
            } elseif ($email === $user->email) {
                $validator->errors()->add('email', 'El correo nuevo es igual al actual.');
            } elseif (User::query()->where('email', $email)->exists()) {
                $validator->errors()->add('email', 'Ese correo ya está registrado en otra cuenta.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'Escribe el nuevo correo de acceso.',
            'email.string' => 'Ingresa un correo válido.',
            'email.email' => 'Ingresa un correo válido.',
            'email.max' => 'El correo no debe superar 254 caracteres.',
            'current_password.required' => 'Escribe tu contraseña actual.',
            'current_password.string' => 'La contraseña actual no es válida.',
            'current_password.max' => 'La contraseña actual no es válida.',
        ];
    }
}
