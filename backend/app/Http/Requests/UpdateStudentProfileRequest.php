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
        // Sin latitude/longitude: el punto de PostGIS lo deriva el servidor del municipio; lo que envíe el cliente se descarta.
        $state = $this->input('state_code');

        return [
            'program' => ['required', 'string', 'max:150'],
            'period_type' => ['required', 'string', Rule::enum(AcademicPeriodType::class)],
            'period_number' => ['required', 'integer', 'between:1,15'],
            'dual_available' => ['required', 'boolean'],
            'state_code' => ['required', 'string', Rule::enum(MexicanState::class)],
            // Clave INEGI de 5 dígitos que debe pertenecer al estado enviado (HU-S4-04 CA-05).
            'municipality_code' => [
                'required', 'string', 'regex:/^\d{5}$/',
                Rule::exists('municipalities', 'code')->where('state_code', is_string($state) ? $state : ''),
            ],
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
            'municipality_code.required' => 'El municipio es obligatorio.',
            'municipality_code.string' => 'El municipio no es válido.',
            'municipality_code.regex' => 'El municipio no es válido.',
            'municipality_code.exists' => 'El municipio no pertenece al estado seleccionado.',
            'can_relocate.required' => 'Indica si puede reubicarse.',
            'can_relocate.boolean' => 'La disponibilidad para reubicarse no es válida.',
        ];
    }
}
