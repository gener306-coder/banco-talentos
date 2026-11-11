<?php

namespace App\Http\Requests;

use App\Enums\SetupDeliveryMethod;
use Illuminate\Validation\Rule;

/**
 * Alta de una empresa (HU-S4-02, T-S8-12): crea también la cuenta de su contacto con el correo del contacto, así que
 * ese correo no puede pertenecer a otra cuenta. El enlace se envía por correo o se genera para compartirlo (HU-S2-01).
 */
class StoreCompanyRequest extends CompanyRequest
{
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'contact_email' => ['required', 'string', 'email', 'max:254', 'unique:users,email'],
            // Opcional: sin valor se envía por correo.
            'delivery_method' => ['sometimes', 'string', Rule::enum(SetupDeliveryMethod::class)],
        ];
    }

    public function messages(): array
    {
        return [
            ...parent::messages(),
            'contact_email.unique' => 'El correo ya está registrado en otra cuenta.',
            'delivery_method.*' => 'El método de entrega debe ser email o manual.',
        ];
    }
}
