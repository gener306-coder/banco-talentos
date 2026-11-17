<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Marcador de lectura del lado de la sesión (HU-S13-01 CA-08): el último mensaje visto. Que pertenezca a la
 * conversación lo verifica el controlador.
 */
class MarkLinkageMessagesReadRequest extends FormRequest
{
    private const FIELDS = ['last_read_message_id'];

    public function authorize(): bool
    {
        // El rol y la organización los garantizan los middlewares; la pertenencia de la solicitud, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'last_read_message_id' => ['required', 'integer', 'min:1', 'max:999999999999999999'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach (array_diff(array_keys($this->json()->all()), self::FIELDS) as $field) {
                    $validator->errors()->add((string) $field, 'Solo se indica el último mensaje leído.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'last_read_message_id.required' => 'Indica el último mensaje leído.',
            'last_read_message_id.integer' => 'El mensaje no es válido.',
            'last_read_message_id.min' => 'El mensaje no es válido.',
            'last_read_message_id.max' => 'El mensaje no es válido.',
        ];
    }
}
