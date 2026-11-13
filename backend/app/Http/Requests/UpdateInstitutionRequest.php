<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class UpdateInstitutionRequest extends StoreInstitutionRequest
{
    /**
     * Editar no crea cuentas ni envía enlaces: el correo de contacto ya no cambia el de inicio de sesión de la cuenta
     * (T-S8-11). El responsable es obligatorio también aquí, para completar el de las instituciones anteriores.
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'contact_email' => ['required', 'string', 'email', 'max:254'],
            'delivery_method' => ['prohibited'],
            'cct' => [
                'required',
                'string',
                'max:255',
                Rule::unique('institutions', 'cct')->ignore($this->route('institution')),
            ],
        ];
    }

    public function messages(): array
    {
        // Antes que los del alta: su mensaje comodín de delivery_method ganaría por orden.
        return [
            'delivery_method.prohibited' => 'Editar la institución no envía enlaces: usa “Reenviar enlace”.',
            ...parent::messages(),
        ];
    }
}
