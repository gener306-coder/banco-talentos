<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Búsqueda y filtro del padrón (HU-S8-01 CA-01): texto libre, estado y página, todos opcionales. */
class ListStudentsRequest extends FormRequest
{
    public const STATUSES = ['active', 'inactive'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'in:'.implode(',', self::STATUSES)],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'q.string' => 'La búsqueda no es válida.',
            'q.max' => 'La búsqueda no debe superar 100 caracteres.',
            'status.string' => 'El estado no es válido.',
            'status.in' => 'El estado no es válido.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
        ];
    }
}
