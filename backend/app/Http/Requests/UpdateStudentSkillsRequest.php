<?php

namespace App\Http\Requests;

use App\Enums\SkillKind;
use App\Rules\NoContactInformation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStudentSkillsRequest extends FormRequest
{
    public const MAX = 30;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'skills' => ['present', 'array', 'list', 'max:'.self::MAX],
            'skills.*' => ['array:name,kind'],
            // El catálogo es compartido: el nombre tampoco puede llevar datos de contacto.
            'skills.*.name' => ['required', 'string', 'max:80', new NoContactInformation],
            'skills.*.kind' => ['required', 'string', Rule::enum(SkillKind::class)],
        ];
    }

    public function messages(): array
    {
        return [
            'skills.present' => 'Envía la lista de habilidades.',
            'skills.array' => 'La lista de habilidades no es válida.',
            'skills.list' => 'La lista de habilidades no es válida.',
            'skills.max' => 'Registra como máximo '.self::MAX.' habilidades.',
            'skills.*.array' => 'La habilidad no es válida.',
            'skills.*.name.required' => 'Escribe el nombre de la habilidad.',
            'skills.*.name.string' => 'El nombre de la habilidad no es válido.',
            'skills.*.name.max' => 'El nombre de la habilidad no debe superar 80 caracteres.',
            'skills.*.kind.required' => 'Indica si la habilidad es técnica o blanda.',
            'skills.*.kind.string' => 'El tipo de habilidad no es válido.',
            'skills.*.kind.enum' => 'El tipo de habilidad no es válido.',
        ];
    }
}
