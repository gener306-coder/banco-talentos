<?php

namespace App\Http\Requests;

use App\Enums\CvLanguage;
use App\Enums\MexicanState;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Filtros del buscador de talento (HU-S4-05 CA-03, CA-04). Llegan en la query string; ninguno acepta coordenadas:
 * el origen del radio es siempre un municipio del catálogo.
 */
class TalentSearchRequest extends FormRequest
{
    public const RADII_KM = [10, 25, 50, 100, 200];

    public const MAX_SKILLS = 10;

    public function authorize(): bool
    {
        // El rol COMPANY con empresa activa lo garantizan los middlewares de la ruta.
        return true;
    }

    public function rules(): array
    {
        return [
            'skills' => ['sometimes', 'array', 'max:'.self::MAX_SKILLS],
            'skills.*' => ['required', 'string', 'max:80'],
            'language' => ['nullable', 'string', Rule::enum(CvLanguage::class)],
            'min_level' => ['nullable', 'integer', 'between:1,7', 'required_with:language'],
            'program' => ['nullable', 'string', 'max:150'],
            'min_period' => ['nullable', 'integer', 'between:1,15'],
            'dual_available' => ['nullable', 'boolean'],
            'can_relocate' => ['nullable', 'boolean'],
            'verified_certification' => ['nullable', 'boolean'],
            'state_code' => ['nullable', 'string', Rule::enum(MexicanState::class)],
            'radius_km' => ['nullable', 'integer', Rule::in(self::RADII_KM)],
            'origin_municipality_code' => ['nullable', 'string', 'regex:/^\d{5}$/', Rule::exists('municipalities', 'code')],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'skills.array' => 'Las habilidades no son válidas.',
            'skills.max' => 'Filtra como máximo por '.self::MAX_SKILLS.' habilidades.',
            'skills.*.required' => 'Las habilidades no pueden estar vacías.',
            'skills.*.string' => 'Las habilidades no son válidas.',
            'skills.*.max' => 'Cada habilidad debe tener como máximo 80 caracteres.',
            'language.enum' => 'El idioma no es válido.',
            'language.string' => 'El idioma no es válido.',
            'min_level.required_with' => 'Indica el nivel mínimo del idioma.',
            'min_level.integer' => 'El nivel mínimo no es válido.',
            'min_level.between' => 'El nivel mínimo no es válido.',
            'program.string' => 'La carrera no es válida.',
            'program.max' => 'La carrera no debe superar 150 caracteres.',
            'min_period.integer' => 'El periodo mínimo debe ser un número del 1 al 15.',
            'min_period.between' => 'El periodo mínimo debe ser un número del 1 al 15.',
            'dual_available.boolean' => 'La disponibilidad dual no es válida.',
            'can_relocate.boolean' => 'La disponibilidad para reubicarse no es válida.',
            'verified_certification.boolean' => 'El filtro de certificación revisada no es válido.',
            'state_code.enum' => 'El estado no es válido.',
            'state_code.string' => 'El estado no es válido.',
            'radius_km.integer' => 'El radio debe ser de 10, 25, 50, 100 o 200 km.',
            'radius_km.in' => 'El radio debe ser de 10, 25, 50, 100 o 200 km.',
            'origin_municipality_code.regex' => 'El municipio de origen no es válido.',
            'origin_municipality_code.exists' => 'El municipio de origen no es válido.',
            'origin_municipality_code.string' => 'El municipio de origen no es válido.',
            'page.integer' => 'La página no es válida.',
            'page.min' => 'La página no es válida.',
        ];
    }
}
