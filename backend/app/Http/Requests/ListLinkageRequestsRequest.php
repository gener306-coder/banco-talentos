<?php

namespace App\Http\Requests;

use App\Enums\LinkageRequestStatus;
use App\Models\LinkageRequest;
use App\Support\InboxSearch;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtros de la bandeja de la empresa (HU-S5-05 CA-01, CA-04): estado y perfil anónimo, ambos opcionales. */
class ListLinkageRequestsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['nullable', 'string', Rule::enum(LinkageRequestStatus::class)],
            'public_id' => ['nullable', 'string', 'uuid'],
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
            'public_id.string' => 'El perfil no es válido.',
            'public_id.uuid' => 'El perfil no es válido.',
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
