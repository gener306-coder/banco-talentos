<?php

namespace App\Http\Requests;

use App\Enums\LinkageRequestStatus;
use App\Models\LinkageRequest;
use App\Support\InboxSearch;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtro de la bandeja institucional (HU-S6-01 CA-03): estado opcional. */
class ListInstitutionLinkageRequestsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['nullable', 'string', Rule::enum(LinkageRequestStatus::class)],
            'page' => ['nullable', 'integer', 'min:1'],
            // T-S13-09: búsqueda, filtro de interacción (reemplaza a `unread`) y orden de la bandeja.
            'q' => ['nullable', 'string', 'max:'.InboxSearch::MAX_LENGTH],
            'interaction' => ['nullable', 'string', Rule::in(LinkageRequest::INTERACTIONS)],
            'sort' => ['nullable', 'string', Rule::in(LinkageRequest::SORTS)],
        ];
    }

    public function messages(): array
    {
        return [
            'status.string' => 'El estado no es válido.',
            'status.enum' => 'El estado no es válido.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
            'sort.string' => 'El orden no es válido.',
            'sort.in' => 'El orden no es válido.',
            'interaction.string' => 'El filtro de conversación no es válido.',
            'interaction.in' => 'El filtro de conversación no es válido.',
            'q.string' => 'La búsqueda no es válida.',
            'q.max' => 'La búsqueda admite hasta 100 caracteres.',
        ];
    }
}
