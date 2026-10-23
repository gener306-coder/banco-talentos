<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCompanyStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['is_active' => ['required', 'boolean:strict']];
    }

    public function messages(): array
    {
        return [
            'is_active.required' => 'Indica si la empresa queda activa o inactiva.',
            'is_active.boolean' => 'El estado de la empresa no es válido.',
        ];
    }
}
