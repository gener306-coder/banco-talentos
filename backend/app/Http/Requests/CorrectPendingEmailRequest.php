<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

/** T-S19-02: correo corregido de una cuenta pendiente de activar. */
class CorrectPendingEmailRequest extends FormRequest
{
    private const ALLOWED = ['email'];

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
        return ['email' => ['required', 'string', 'email', 'max:254']];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), self::ALLOWED) as $field) {
                $validator->errors()->add($field, 'Solo se puede corregir el correo de acceso.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'Escribe el correo correcto.',
            'email.string' => 'Ingresa un correo válido.',
            'email.email' => 'Ingresa un correo válido.',
            'email.max' => 'El correo no debe superar 254 caracteres.',
        ];
    }
}
