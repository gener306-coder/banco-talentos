<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Datos de la cuenta propia (HU-S14-01 CA-02): solo el nombre. El correo de acceso, el rol y la organización no se
 * editan aquí; cualquier otro campo se rechaza en lugar de ignorarse.
 */
class UpdateAccountRequest extends FormRequest
{
    private const ALLOWED = ['name'];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }

    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:120']];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), self::ALLOWED) as $field) {
                $validator->errors()->add($field, 'Este dato no se puede cambiar desde tu cuenta.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Escribe tu nombre.',
            'name.string' => 'El nombre no es válido.',
            'name.max' => 'El nombre admite hasta 120 caracteres.',
        ];
    }
}
