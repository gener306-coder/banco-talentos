<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Mensaje nuevo de la conversación (HU-S13-01 CA-07): solo el texto. El lado, la cuenta y la solicitud los fija el
 * servidor; cualquier otro campo del cuerpo se rechaza con su nombre.
 */
class StoreLinkageMessageRequest extends FormRequest
{
    private const FIELDS = ['body'];

    public function authorize(): bool
    {
        // El rol y la organización los garantizan los middlewares; la pertenencia de la solicitud, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'max:2000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach (array_diff(array_keys($this->json()->all()), self::FIELDS) as $field) {
                    $validator->errors()->add((string) $field, 'El mensaje solo admite el texto.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Escribe un mensaje.',
            'body.string' => 'El mensaje no es válido.',
            'body.max' => 'El mensaje no debe superar 2000 caracteres.',
        ];
    }
}
