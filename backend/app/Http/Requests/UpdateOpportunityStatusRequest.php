<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** Baja lógica de una oportunidad (HU-S5-03 CA-01): solo {is_active: true | false}, booleano estricto. */
class UpdateOpportunityStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la empresa los garantizan los middlewares; la pertenencia de la oportunidad, el controlador.
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
