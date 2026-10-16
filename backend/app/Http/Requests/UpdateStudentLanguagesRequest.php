<?php

namespace App\Http\Requests;

use App\Enums\CvLanguage;
use App\Enums\LanguageLevel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStudentLanguagesRequest extends FormRequest
{
    public const MAX = 10;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'languages' => ['present', 'array', 'list', 'max:'.self::MAX],
            'languages.*' => ['array:language_code,level'],
            'languages.*.language_code' => ['required', 'string', Rule::enum(CvLanguage::class), 'distinct'],
            'languages.*.level' => ['required', 'integer', Rule::enum(LanguageLevel::class)],
        ];
    }

    public function messages(): array
    {
        return [
            'languages.present' => 'Envía la lista de idiomas.',
            'languages.array' => 'La lista de idiomas no es válida.',
            'languages.list' => 'La lista de idiomas no es válida.',
            'languages.max' => 'Registra como máximo '.self::MAX.' idiomas.',
            'languages.*.array' => 'El idioma no es válido.',
            'languages.*.language_code.required' => 'Selecciona el idioma.',
            'languages.*.language_code.string' => 'El idioma no es válido.',
            'languages.*.language_code.enum' => 'El idioma no es válido.',
            'languages.*.language_code.distinct' => 'Este idioma ya está en la lista.',
            'languages.*.level.required' => 'Selecciona el nivel.',
            'languages.*.level.integer' => 'El nivel no es válido.',
            'languages.*.level.enum' => 'El nivel no es válido.',
        ];
    }
}
