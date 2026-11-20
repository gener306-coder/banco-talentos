<?php

namespace App\Http\Requests;

use App\Models\Institution;
use App\Rules\WorkCenterKey;
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
            // T-S14-15: el formato se exige solo a un CCT nuevo; uno anterior a la regla se conserva si no cambia.
            'cct' => [
                'bail',
                'required',
                'string',
                new WorkCenterKey($this->currentCct()),
                Rule::unique('institutions', 'cct')->ignore($this->route('institution')),
            ],
        ];
    }

    protected function currentCct(): ?string
    {
        return Institution::query()->whereKey($this->route('institution'))->value('cct');
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
