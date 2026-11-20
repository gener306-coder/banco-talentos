<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** T-S14-13: baja de una vinculación aceptada, con su motivo obligatorio y sin ningún otro campo. */
class TerminateLinkageRequestRequest extends FormRequest
{
    public const CONTACT_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: el motivo lo ve la otra organización en la plataforma.';

    public function authorize(): bool
    {
        // El rol y la organización los garantizan los middlewares; la pertenencia de la solicitud, el controlador.
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('reason'))) {
            $this->merge(['reason' => trim($this->input('reason'))]);
        }
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:500', new NoContactInformation(self::CONTACT_MESSAGE)],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach (array_diff(array_keys($this->json()->all()), ['reason']) as $field) {
                    $validator->errors()->add((string) $field, 'La baja solo admite el motivo.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Escribe el motivo de la baja.',
            'reason.string' => 'El motivo no es válido.',
            'reason.max' => 'El motivo no debe superar 500 caracteres.',
        ];
    }
}
