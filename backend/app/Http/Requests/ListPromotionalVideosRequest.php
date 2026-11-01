<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Filtros de la galería de promoción dual (HU-S9-03 CA-01): institución por su public_id y página, ambos opcionales. */
class ListPromotionalVideosRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'institution' => ['nullable', 'string', 'uuid'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'institution.string' => 'La institución no es válida.',
            'institution.uuid' => 'La institución no es válida.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
        ];
    }
}
