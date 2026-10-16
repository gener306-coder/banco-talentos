<?php

namespace App\Http\Requests;

use App\Enums\StudentLinkKind;
use App\Rules\SafeHttpsUrl;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStudentLinksRequest extends FormRequest
{
    public const MAX = 10;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'links' => ['present', 'array', 'list', 'max:'.self::MAX],
            'links.*' => ['array:kind,url'],
            'links.*.kind' => ['required', 'string', Rule::enum(StudentLinkKind::class)],
            'links.*.url' => [
                'required', 'string', 'max:2048', 'distinct:ignore_case', new SafeHttpsUrl,
                // GitHub, LinkedIn y Behance deben pertenecer a su dominio.
                function (string $attribute, mixed $value, Closure $fail): void {
                    $index = explode('.', $attribute)[1];
                    $kind = StudentLinkKind::tryFrom((string) $this->input("links.$index.kind"));
                    $host = $kind?->requiredHost();
                    if (is_string($value) && $host !== null && ! SafeHttpsUrl::belongsTo(SafeHttpsUrl::host($value), $host)) {
                        $fail("El enlace debe ser de {$host}.");
                    }
                },
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'links.present' => 'Envía la lista de enlaces.',
            'links.array' => 'La lista de enlaces no es válida.',
            'links.list' => 'La lista de enlaces no es válida.',
            'links.max' => 'Registra como máximo '.self::MAX.' enlaces.',
            'links.*.array' => 'El enlace no es válido.',
            'links.*.kind.required' => 'Selecciona el tipo de enlace.',
            'links.*.kind.string' => 'El tipo de enlace no es válido.',
            'links.*.kind.enum' => 'El tipo de enlace no es válido.',
            'links.*.url.required' => 'Escribe la dirección del enlace.',
            'links.*.url.string' => 'Escribe una dirección https:// pública y válida.',
            'links.*.url.max' => 'La dirección del enlace es demasiado larga.',
            'links.*.url.distinct' => 'Este enlace ya está en la lista.',
        ];
    }
}
