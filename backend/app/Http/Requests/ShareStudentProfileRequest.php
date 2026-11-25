<?php

namespace App\Http\Requests;

use App\Models\StudentDisclosure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** T-S19-05: grupos de la lista blanca (D2) y la confirmación del consentimiento del alumno o su tutor (D3). */
class ShareStudentProfileRequest extends FormRequest
{
    private const ALLOWED = ['fields', 'consent'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'fields' => ['required', 'array', 'min:1', 'max:'.count(StudentDisclosure::SHAREABLE)],
            'fields.*' => ['required', 'string', 'distinct', Rule::in(StudentDisclosure::SHAREABLE)],
            'consent' => ['required', 'accepted'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), self::ALLOWED) as $field) {
                $validator->errors()->add($field, 'Este dato no forma parte de la ficha compartida.');
            }
        }];
    }

    public function messages(): array
    {
        return [
            'fields.required' => 'Elige al menos un grupo de datos para compartir.',
            'fields.array' => 'Elige al menos un grupo de datos para compartir.',
            'fields.min' => 'Elige al menos un grupo de datos para compartir.',
            'fields.max' => 'Elige solo grupos de la ficha.',
            'fields.*.in' => 'Ese dato no se puede compartir con la empresa.',
            'fields.*.distinct' => 'Cada grupo se elige una sola vez.',
            'fields.*.*' => 'Ese dato no se puede compartir con la empresa.',
            'consent.required' => 'Confirma que cuentas con el consentimiento del alumno o de su tutor.',
            'consent.accepted' => 'Confirma que cuentas con el consentimiento del alumno o de su tutor.',
        ];
    }
}
