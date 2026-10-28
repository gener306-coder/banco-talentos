<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** Estado de una cuenta SECRETARY o COMPANY (HU-S6-04 CA-01, CA-03): solo {is_active: true | false}, booleano estricto. */
class UpdateAccountStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol lo garantiza el middleware; la cuenta y su organización, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'is_active' => ['required', 'boolean:strict'],
        ];
    }

    /** El cambio de estado no edita nada más: cualquier otro campo del cuerpo se rechaza con su nombre. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach (array_diff(array_keys($this->json()->all()), ['is_active']) as $field) {
                    $validator->errors()->add((string) $field, 'La acción de cambio de estado solo permite modificar is_active.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'is_active.required' => 'El estado es obligatorio.',
            'is_active.boolean' => 'El estado debe ser true o false.',
        ];
    }
}
