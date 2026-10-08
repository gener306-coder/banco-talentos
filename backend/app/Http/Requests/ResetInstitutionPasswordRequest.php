<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\InstitutionPasswordRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class ResetInstitutionPasswordRequest extends FormRequest
{
    use InstitutionPasswordRules;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => Str::lower(trim($this->input('email')))]);
        }
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:254'],
            'token' => ['bail', 'required', 'string', 'size:64', 'regex:/\\A[a-f0-9]{64}\\z/'],
            ...$this->passwordRules(),
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'El enlace de restablecimiento no es válido.',
            'email.email' => 'El enlace de restablecimiento no es válido.',
            'token.*' => 'El enlace de restablecimiento no es válido o ha expirado.',
            ...$this->passwordMessages(),
        ];
    }
}
