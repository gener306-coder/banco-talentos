<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class UpdateInstitutionRequest extends StoreInstitutionRequest
{
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'cct' => [
                'required',
                'string',
                'max:255',
                Rule::unique('institutions', 'cct')->ignore($this->route('institution')),
            ],
        ];
    }
}
