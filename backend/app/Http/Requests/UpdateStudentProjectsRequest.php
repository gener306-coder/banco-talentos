<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use Illuminate\Foundation\Http\FormRequest;

class UpdateStudentProjectsRequest extends FormRequest
{
    public const MAX = 10;

    public const FIRST_YEAR = 1950;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Sin URL: los enlaces de un proyecto van en la sección protegida de enlaces.
        return [
            'projects' => ['present', 'array', 'list', 'max:'.self::MAX],
            'projects.*' => ['array:title,description,role,year'],
            'projects.*.title' => ['required', 'string', 'max:120', new NoContactInformation],
            'projects.*.description' => ['required', 'string', 'max:1000', new NoContactInformation],
            'projects.*.role' => ['nullable', 'string', 'max:80', new NoContactInformation],
            'projects.*.year' => ['nullable', 'integer', 'between:'.self::FIRST_YEAR.','.now()->year],
        ];
    }

    public function messages(): array
    {
        return [
            'projects.present' => 'Envía la lista de proyectos.',
            'projects.array' => 'La lista de proyectos no es válida.',
            'projects.list' => 'La lista de proyectos no es válida.',
            'projects.max' => 'Registra como máximo '.self::MAX.' proyectos.',
            'projects.*.array' => 'El proyecto no es válido.',
            'projects.*.title.required' => 'Escribe el nombre del proyecto.',
            'projects.*.title.string' => 'El nombre del proyecto no es válido.',
            'projects.*.title.max' => 'El nombre del proyecto no debe superar 120 caracteres.',
            'projects.*.description.required' => 'Describe el proyecto.',
            'projects.*.description.string' => 'La descripción no es válida.',
            'projects.*.description.max' => 'La descripción no debe superar 1000 caracteres.',
            'projects.*.role.string' => 'El rol no es válido.',
            'projects.*.role.max' => 'El rol no debe superar 80 caracteres.',
            'projects.*.year.integer' => 'El año no es válido.',
            'projects.*.year.between' => 'El año debe estar entre '.self::FIRST_YEAR.' y el año actual.',
        ];
    }
}
