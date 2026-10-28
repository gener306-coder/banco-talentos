<?php

namespace App\Http\Requests;

use App\Enums\LinkageRequestStatus;
use App\Rules\NoContactInformation;
use App\Support\ContactInformation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** Respuesta institucional (HU-S6-02 CA-01): ACEPTADA o RECHAZADA con una nota opcional, sin ningún otro campo. */
class DecideLinkageRequestRequest extends FormRequest
{
    private const FIELDS = ['status', 'response_message'];

    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia de la solicitud, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', 'string', Rule::in([LinkageRequestStatus::ACCEPTED->value, LinkageRequestStatus::REJECTED->value])],
            'response_message' => ['nullable', 'string', 'max:500', new NoContactInformation(ContactInformation::RESPONSE_MESSAGE)],
        ];
    }

    /** La respuesta no edita nada más: cualquier otro campo del cuerpo se rechaza con su nombre. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach (array_diff(array_keys($this->json()->all()), self::FIELDS) as $field) {
                    $validator->errors()->add((string) $field, 'La respuesta solo admite el estado y el mensaje.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'status.required' => 'Elige si aceptas o rechazas la solicitud.',
            'status.string' => 'Elige si aceptas o rechazas la solicitud.',
            'status.in' => 'Elige si aceptas o rechazas la solicitud.',
            'response_message.string' => 'El mensaje no es válido.',
            'response_message.max' => 'El mensaje no debe superar 500 caracteres.',
        ];
    }
}
