<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use App\Rules\SafeHttpsUrl;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateStudentCertificationsRequest extends FormRequest
{
    public const MAX = 20;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'certifications' => ['present', 'array', 'list', 'max:'.self::MAX],
            'certifications.*' => ['array:id,name,issuer,issued_on,expires_on,credential_id,credential_url'],
            // Con id se actualiza una existente del alumno (lo comprueba el controlador); sin id, se crea.
            'certifications.*.id' => ['nullable', 'integer', 'min:1', 'distinct'],
            'certifications.*.name' => ['required', 'string', 'max:150', new NoContactInformation],
            'certifications.*.issuer' => ['required', 'string', 'max:120', new NoContactInformation],
            'certifications.*.issued_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'certifications.*.expires_on' => ['nullable', 'date_format:Y-m-d'],
            // Credencial: dato protegido (la página de verificación muestra el nombre del alumno).
            'certifications.*.credential_id' => ['nullable', 'string', 'max:120'],
            'certifications.*.credential_url' => ['nullable', 'string', 'max:2048', new SafeHttpsUrl],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach ((array) $this->input('certifications', []) as $index => $item) {
                    $issued = is_array($item) ? ($item['issued_on'] ?? null) : null;
                    $expires = is_array($item) ? ($item['expires_on'] ?? null) : null;
                    if (is_string($issued) && is_string($expires) && $expires < $issued
                        && ! $validator->errors()->has("certifications.$index.expires_on")) {
                        $validator->errors()->add("certifications.$index.expires_on", 'La vigencia no puede terminar antes de la fecha de emisión.');
                    }
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'certifications.present' => 'Envía la lista de certificaciones.',
            'certifications.array' => 'La lista de certificaciones no es válida.',
            'certifications.list' => 'La lista de certificaciones no es válida.',
            'certifications.max' => 'Registra como máximo '.self::MAX.' certificaciones.',
            'certifications.*.array' => 'La certificación no es válida.',
            'certifications.*.id.integer' => 'La certificación no existe.',
            'certifications.*.id.min' => 'La certificación no existe.',
            'certifications.*.id.distinct' => 'La certificación está repetida.',
            'certifications.*.name.required' => 'Escribe el nombre de la certificación.',
            'certifications.*.name.string' => 'El nombre de la certificación no es válido.',
            'certifications.*.name.max' => 'El nombre de la certificación no debe superar 150 caracteres.',
            'certifications.*.issuer.required' => 'Escribe quién emitió la certificación.',
            'certifications.*.issuer.string' => 'El emisor no es válido.',
            'certifications.*.issuer.max' => 'El emisor no debe superar 120 caracteres.',
            'certifications.*.issued_on.required' => 'Indica la fecha de emisión.',
            'certifications.*.issued_on.date_format' => 'La fecha de emisión no es válida.',
            'certifications.*.issued_on.before_or_equal' => 'La fecha de emisión no puede ser futura.',
            'certifications.*.expires_on.date_format' => 'La fecha de vigencia no es válida.',
            'certifications.*.credential_id.string' => 'El identificador de la credencial no es válido.',
            'certifications.*.credential_id.max' => 'El identificador de la credencial no debe superar 120 caracteres.',
            'certifications.*.credential_url.string' => 'Escribe una dirección https:// pública y válida.',
            'certifications.*.credential_url.max' => 'La dirección de la credencial es demasiado larga.',
        ];
    }
}
