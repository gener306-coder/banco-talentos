<?php

namespace App\Http\Requests;

use App\Enums\LinkageRequestStatus;
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
        ];
    }

    public function messages(): array
    {
        return [
            'status.string' => 'El estado no es válido.',
            'status.enum' => 'El estado no es válido.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
        ];
    }
}
