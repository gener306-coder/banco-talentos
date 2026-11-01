<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Moderación mínima del Administrador (HU-S9-03 CA-05): solo {is_active: false}. Reactivar es decisión de la
 * institución (HU-S9-02): el Administrador no sustituye a los actores.
 */
class DeactivatePromotionalVideoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'is_active' => ['required', 'boolean:strict', 'declined'],
        ];
    }

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
            'is_active.declined' => 'El Administrador solo puede inactivar videos; reactivarlo le corresponde a la institución.',
        ];
    }
}
