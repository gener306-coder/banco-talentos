<?php

namespace App\Http\Requests;

use App\Enums\AuditEventType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtro de la bitácora (HU-S7-03 CA-02): tipo de evento opcional y página. */
class ListAuditEventsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['nullable', 'string', Rule::enum(AuditEventType::class)],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.string' => 'El tipo de evento no es válido.',
            'type.enum' => 'El tipo de evento no es válido.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
        ];
    }
}
