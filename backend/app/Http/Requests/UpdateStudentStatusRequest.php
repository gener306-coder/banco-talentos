<?php

namespace App\Http\Requests;

use App\Models\Student;
use App\Models\StudentIdentity;
use Illuminate\Foundation\Http\FormRequest;

class UpdateStudentStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del alumno, el controlador.
        return true;
    }

    public function rules(): array
    {
        // El cambio de estado no edita nada más: el expediente y la identidad tienen sus propias rutas.
        $others = [...Student::PROFILE_ATTRIBUTES, ...StudentIdentity::PROTECTED_ATTRIBUTES, 'institution_id'];

        return [
            'is_active' => ['required', 'boolean:strict'],
            ...array_fill_keys($others, ['missing']),
        ];
    }

    public function messages(): array
    {
        return [
            'is_active.required' => 'El estado es obligatorio.',
            'is_active.boolean' => 'El estado debe ser true o false.',
            '*.missing' => 'La acción de cambio de estado solo permite modificar is_active.',
        ];
    }
}
