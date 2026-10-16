<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCertificationVerificationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['verified' => ['required', 'boolean:strict']];
    }

    public function messages(): array
    {
        return [
            'verified.required' => 'Indica si la certificación está revisada.',
            'verified.boolean' => 'La revisión debe ser true o false.',
        ];
    }
}
