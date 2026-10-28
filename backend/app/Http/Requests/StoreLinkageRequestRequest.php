<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use App\Support\ContactInformation;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Alta de una solicitud de vinculación (HU-S5-04 CA-02): el alumno por su public_id, la oportunidad por su id y un
 * mensaje opcional. La empresa, la institución, el alumno interno y la cuenta los asigna el servidor; la existencia
 * y pertenencia del perfil y de la oportunidad las comprueba el controlador dentro de la transacción (CA-03).
 */
class StoreLinkageRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol COMPANY y la empresa vinculada los garantizan los middlewares de la ruta.
        return true;
    }

    public function rules(): array
    {
        return [
            'student_public_id' => ['required', 'string', 'uuid'],
            'opportunity_id' => ['required', 'integer', 'min:1', 'max:999999999999999999'],
            'message' => ['nullable', 'string', 'max:500', new NoContactInformation(ContactInformation::OPPORTUNITY_MESSAGE)],
        ];
    }

    public function messages(): array
    {
        return [
            'student_public_id.required' => 'Indica el perfil.',
            'student_public_id.string' => 'El perfil no es válido.',
            'student_public_id.uuid' => 'El perfil no es válido.',
            'opportunity_id.required' => 'Elige una de tus oportunidades activas.',
            'opportunity_id.integer' => 'Elige una de tus oportunidades activas.',
            'opportunity_id.min' => 'Elige una de tus oportunidades activas.',
            'opportunity_id.max' => 'Elige una de tus oportunidades activas.',
            'message.string' => 'El mensaje no es válido.',
            'message.max' => 'El mensaje no debe superar 500 caracteres.',
        ];
    }
}
