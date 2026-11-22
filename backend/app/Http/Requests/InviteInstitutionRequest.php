<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * HU-S16-06: Administración invita a la institución solo con el correo de su cuenta y, opcionales, un nombre de
 * referencia y el de la persona. El contacto y el CCT los captura la institución en su perfil (D5).
 */
class InviteInstitutionRequest extends FormRequest
{
    private const ALLOWED = ['email', 'name', 'person_name', 'delivery_method'];

    public function authorize(): bool
    {
        return $this->user()?->role === UserRole::ADMIN;
    }

    protected function prepareForValidation(): void
    {
        $clean = [];
        foreach (['name', 'person_name'] as $field) {
            if (is_string($this->input($field))) {
                $clean[$field] = trim($this->input($field)) === '' ? null : trim($this->input($field));
            }
        }
        if (is_string($this->input('email'))) {
            $clean['email'] = Str::lower(trim($this->input('email')));
        }
        $this->merge($clean);
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:254', 'unique:users,email'],
            'name' => ['nullable', 'string', 'max:255'],
            'person_name' => ['nullable', 'string', 'max:120'],
            // Opcional: sin valor se envía por correo.
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), self::ALLOWED) as $field) {
                $validator->errors()->add($field, 'Este dato lo captura la institución desde su perfil.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'El correo de la cuenta es obligatorio.',
            'email.string' => 'Ingresa un correo válido.',
            'email.email' => 'Ingresa un correo válido.',
            'email.max' => 'El correo no debe superar 254 caracteres.',
            'email.unique' => 'El correo ya está registrado en otra cuenta.',
            'name.string' => 'El nombre de la institución no es válido.',
            'name.max' => 'El nombre de la institución no debe superar 255 caracteres.',
            'person_name.string' => 'El nombre de la persona no es válido.',
            'person_name.max' => 'El nombre de la persona no debe superar 120 caracteres.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
        ];
    }
}
