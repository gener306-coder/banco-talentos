<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use Illuminate\Foundation\Http\FormRequest;

class UpdateStudentHeadlineRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del alumno, el controlador.
        return true;
    }

    public function rules(): array
    {
        // Vacío (null) borra el titular.
        return [
            'headline' => ['present', 'nullable', 'string', 'max:120', new NoContactInformation],
        ];
    }

    public function messages(): array
    {
        return [
            'headline.present' => 'Envía el titular profesional.',
            'headline.string' => 'El titular profesional no es válido.',
            'headline.max' => 'El titular profesional no debe superar 120 caracteres.',
        ];
    }
}
