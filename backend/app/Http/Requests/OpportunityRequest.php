<?php

namespace App\Http\Requests;

use App\Enums\AcademicPeriodType;
use App\Enums\CvLanguage;
use App\Enums\LanguageLevel;
use App\Enums\MexicanState;
use App\Enums\SkillKind;
use App\Rules\NoContactInformation;
use App\Support\ContactInformation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Alta y edición de una oportunidad dual (HU-S5-02 CA-03 a CA-05). La empresa, la cuenta creadora y el punto los
 * asigna el servidor: company_id, created_by y las coordenadas quedan fuera de validated(). El estado activo se
 * rechaza porque su cambio pertenece a HU-S5-03.
 */
class OpportunityRequest extends FormRequest
{
    public const MAX_SKILLS = 15;

    public function authorize(): bool
    {
        // El rol COMPANY y la empresa vinculada los garantizan los middlewares de la ruta.
        return true;
    }

    public function rules(): array
    {
        $state = $this->input('state_code');

        return [
            'title' => ['required', 'string', 'max:150', new NoContactInformation(ContactInformation::OPPORTUNITY_MESSAGE)],
            'program' => ['required', 'string', 'max:150', new NoContactInformation(ContactInformation::OPPORTUNITY_MESSAGE)],
            'period_type' => ['required', 'string', Rule::enum(AcademicPeriodType::class)],
            'period_number' => ['required', 'integer', 'between:1,15'],
            'vacancies' => ['required', 'integer', 'between:1,50'],
            'can_relocate' => ['required', 'boolean'],
            'state_code' => ['required', 'string', Rule::enum(MexicanState::class)],
            // Clave INEGI de 5 dígitos que debe pertenecer al estado enviado (HU-S4-04).
            'municipality_code' => [
                'required', 'string', 'regex:/^\d{5}$/',
                Rule::exists('municipalities', 'code')->where('state_code', is_string($state) ? $state : ''),
            ],
            'description' => ['required', 'string', 'max:1500', new NoContactInformation(ContactInformation::OPPORTUNITY_MESSAGE)],
            'skills' => ['sometimes', 'array', 'list', 'max:'.self::MAX_SKILLS],
            'skills.*' => ['array:name,kind'],
            // El catálogo es compartido: el nombre de una habilidad nueva tampoco puede llevar datos de contacto.
            'skills.*.name' => ['required', 'string', 'max:80', new NoContactInformation(ContactInformation::OPPORTUNITY_MESSAGE)],
            'skills.*.kind' => ['required', 'string', Rule::enum(SkillKind::class)],
            // Idioma y nivel mínimo, ambos o ninguno.
            'language_code' => ['nullable', 'required_with:min_level', 'string', Rule::enum(CvLanguage::class)],
            'min_level' => ['nullable', 'required_with:language_code', 'integer', Rule::enum(LanguageLevel::class)],
            'is_active' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'El título de la oportunidad es obligatorio.',
            'title.string' => 'El título de la oportunidad no es válido.',
            'title.max' => 'El título de la oportunidad no debe superar 150 caracteres.',
            'program.required' => 'La carrera o programa requerido es obligatorio.',
            'program.string' => 'La carrera o programa requerido no es válido.',
            'program.max' => 'La carrera o programa requerido no debe superar 150 caracteres.',
            'period_type.required' => 'Indica si el periodo mínimo es semestre o cuatrimestre.',
            'period_type.string' => 'El tipo de periodo no es válido.',
            'period_type.enum' => 'El tipo de periodo no es válido.',
            'period_number.required' => 'El periodo mínimo es obligatorio.',
            'period_number.integer' => 'El periodo mínimo debe ser un número del 1 al 15.',
            'period_number.between' => 'El periodo mínimo debe ser un número del 1 al 15.',
            'vacancies.required' => 'El número de lugares es obligatorio.',
            'vacancies.integer' => 'El número de lugares debe ser un entero del 1 al 50.',
            'vacancies.between' => 'El número de lugares debe ser un entero del 1 al 50.',
            'can_relocate.required' => 'Indica si la oportunidad requiere reubicarse.',
            'can_relocate.boolean' => 'La disponibilidad para reubicarse no es válida.',
            'state_code.required' => 'El estado es obligatorio.',
            'state_code.string' => 'El estado no es válido.',
            'state_code.enum' => 'El estado no es válido.',
            'municipality_code.required' => 'El municipio es obligatorio.',
            'municipality_code.string' => 'El municipio no es válido.',
            'municipality_code.regex' => 'El municipio no es válido.',
            'municipality_code.exists' => 'El municipio no pertenece al estado seleccionado.',
            'description.required' => 'La descripción de actividades es obligatoria.',
            'description.string' => 'La descripción de actividades no es válida.',
            'description.max' => 'La descripción de actividades no debe superar 1500 caracteres.',
            'skills.array' => 'La lista de habilidades no es válida.',
            'skills.list' => 'La lista de habilidades no es válida.',
            'skills.max' => 'Registra como máximo '.self::MAX_SKILLS.' habilidades.',
            'skills.*.array' => 'La habilidad no es válida.',
            'skills.*.name.required' => 'Escribe el nombre de la habilidad.',
            'skills.*.name.string' => 'El nombre de la habilidad no es válido.',
            'skills.*.name.max' => 'El nombre de la habilidad no debe superar 80 caracteres.',
            'skills.*.kind.required' => 'Indica si la habilidad es técnica o blanda.',
            'skills.*.kind.string' => 'El tipo de habilidad no es válido.',
            'skills.*.kind.enum' => 'El tipo de habilidad no es válido.',
            'language_code.required_with' => 'Selecciona el idioma del nivel mínimo.',
            'language_code.string' => 'El idioma no es válido.',
            'language_code.enum' => 'El idioma no es válido.',
            'min_level.required_with' => 'Selecciona el nivel mínimo del idioma.',
            'min_level.integer' => 'El nivel no es válido.',
            'min_level.enum' => 'El nivel no es válido.',
            'is_active.prohibited' => 'El estado de la oportunidad no se cambia desde este formulario.',
        ];
    }
}
