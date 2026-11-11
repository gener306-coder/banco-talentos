<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Filtros de la galería de promoción dual (HU-S9-03 CA-01, T-S9-03): institución por su public_id, página, orden y la
 * historia que va primero. El orden al azar usa una semilla para que la paginación no repita ni salte historias.
 */
class ListPromotionalVideosRequest extends FormRequest
{
    public const ORDERS = ['recent', 'random'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'institution' => ['nullable', 'string', 'uuid'],
            'page' => ['nullable', 'integer', 'min:1'],
            'order' => ['nullable', 'string', 'in:'.implode(',', self::ORDERS)],
            'seed' => ['required_if:order,random', 'nullable', 'integer', 'between:1,2147483647'],
            'first' => ['nullable', 'string', 'uuid'],
        ];
    }

    public function messages(): array
    {
        return [
            'institution.string' => 'La institución no es válida.',
            'institution.uuid' => 'La institución no es válida.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
            'order.string' => 'El orden no es válido.',
            'order.in' => 'El orden no es válido.',
            'seed.required_if' => 'El orden al azar necesita una semilla.',
            'seed.integer' => 'La semilla no es válida.',
            'seed.between' => 'La semilla no es válida.',
            'first.string' => 'La historia no es válida.',
            'first.uuid' => 'La historia no es válida.',
        ];
    }
}
