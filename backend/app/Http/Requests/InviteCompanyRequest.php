<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Invitación de una empresa (HU-S14-02 CA-01): la Secretaría solo captura el correo de la cuenta y, opcionales, un
 * nombre de referencia de la empresa y el nombre de la persona. El perfil lo captura la empresa; cualquier otro campo
 * se rechaza por nombre para que nada se pierda en silencio.
 */
class InviteCompanyRequest extends FormRequest
{
    private const ALLOWED = ['email', 'trade_name', 'person_name', 'delivery_method'];

    public function authorize(): bool
    {
        // El rol SECRETARY lo garantiza el middleware de la ruta.
        return true;
    }

    protected function prepareForValidation(): void
    {
        $clean = [];
        foreach (['trade_name', 'person_name'] as $field) {
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
            'trade_name' => ['nullable', 'string', 'max:150'],
            'person_name' => ['nullable', 'string', 'max:120'],
            // Opcional: sin valor se envía por correo.
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), self::ALLOWED) as $field) {
                $validator->errors()->add($field, 'Este dato lo captura la empresa desde su perfil.');
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
            'trade_name.string' => 'El nombre de la empresa no es válido.',
            'trade_name.max' => 'El nombre de la empresa no debe superar 150 caracteres.',
            'person_name.string' => 'El nombre de la persona no es válido.',
            'person_name.max' => 'El nombre de la persona no debe superar 120 caracteres.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
        ];
    }
}
