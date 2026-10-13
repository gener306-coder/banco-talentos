<?php

namespace App\Http\Requests;

use App\Enums\AcademicPeriodType;
use App\Enums\MexicanState;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStudentProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del alumno, el controlador.
        return true;
    }

    public function rules(): array
    {
        // Sin latitude/longitude: el punto de PostGIS lo deriva el servidor del estado; lo que envíe el cliente se descarta.
        return [
            'program' => ['required', 'string', 'max:150'],
            'period_type' => ['required', 'string', Rule::enum(AcademicPeriodType::class)],
            'period_number' => ['required', 'integer', 'between:1,15'],
            'dual_available' => ['required', 'boolean'],
            'state_code' => ['required', 'string', Rule::enum(MexicanState::class)],
            'municipality' => ['required', 'string', 'max:120'],
            'can_relocate' => ['required', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'program.required' => 'La carrera o programa educativo es obligatorio.',
            'program.string' => 'La carrera o programa educativo no es válido.',
            'program.max' => 'La carrera o programa educativo no debe superar 150 caracteres.',
            'period_type.required' => 'Indica si el periodo es semestre o cuatrimestre.',
            'period_type.string' => 'El tipo de periodo no es válido.',
            'period_type.enum' => 'El tipo de periodo no es válido.',
            'period_number.required' => 'El periodo actual es obligatorio.',
            'period_number.integer' => 'El periodo actual debe ser un número del 1 al 15.',
            'period_number.between' => 'El periodo actual debe ser un número del 1 al 15.',
            'dual_available.required' => 'Indica la disponibilidad para el programa dual.',
            'dual_available.boolean' => 'La disponibilidad para el programa dual no es válida.',
            'state_code.required' => 'El estado es obligatorio.',
            'state_code.string' => 'El estado no es válido.',
            'state_code.enum' => 'El estado no es válido.',
            'municipality.required' => 'El municipio es obligatorio.',
            'municipality.string' => 'El municipio no es válido.',
            'municipality.max' => 'El municipio no debe superar 120 caracteres.',
            'can_relocate.required' => 'Indica si puede reubicarse.',
            'can_relocate.boolean' => 'La disponibilidad para reubicarse no es válida.',
        ];
    }
}
