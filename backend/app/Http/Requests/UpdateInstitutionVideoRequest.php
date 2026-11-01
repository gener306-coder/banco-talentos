<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use App\Support\ContactInformation;
use Illuminate\Foundation\Http\FormRequest;

/** Textos de un video promocional (HU-S9-02 CA-02), con las mismas reglas que la subida (HU-S9-01 CA-02). */
class UpdateInstitutionVideoRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del video, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:120', new NoContactInformation(ContactInformation::VIDEO_MESSAGE)],
            'description' => ['nullable', 'string', 'max:1000', new NoContactInformation(ContactInformation::VIDEO_MESSAGE)],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'El título es obligatorio.',
            'title.max' => 'El título no debe superar 120 caracteres.',
            'description.max' => 'La descripción no debe superar 1000 caracteres.',
        ];
    }
}
