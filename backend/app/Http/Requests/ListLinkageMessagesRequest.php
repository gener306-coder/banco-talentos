<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Conversación de una solicitud (HU-S13-01 CA-06): opcionalmente, solo los mensajes posteriores a `after`. */
class ListLinkageMessagesRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la organización los garantizan los middlewares; la pertenencia de la solicitud, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'after' => ['nullable', 'integer', 'min:0', 'max:999999999999999999'],
        ];
    }

    public function messages(): array
    {
        return [
            'after.integer' => 'El mensaje de referencia no es válido.',
            'after.min' => 'El mensaje de referencia no es válido.',
            'after.max' => 'El mensaje de referencia no es válido.',
        ];
    }
}
