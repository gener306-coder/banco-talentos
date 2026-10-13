<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreStudentRequest extends FormRequest
{
    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares role:INSTITUTION e institution.member.
        return true;
    }

    public function rules(): array
    {
        return [
            'enrollment_number' => ['bail', 'required', 'string', 'max:30', 'regex:/\A[A-Za-z0-9][A-Za-z0-9.\/-]*\z/'],
            'given_names' => ['required', 'string', 'max:120'],
            'first_surname' => ['required', 'string', 'max:120'],
            'second_surname' => ['nullable', 'string', 'max:120'],
        ];
    }

    public function messages(): array
    {
        return [
            'enrollment_number.required' => 'La matrícula es obligatoria.',
            'enrollment_number.max' => 'La matrícula no debe superar 30 caracteres.',
            'enrollment_number.regex' => 'La matrícula solo admite letras, números, guion, punto y diagonal, sin espacios.',
            'enrollment_number.string' => 'La matrícula no es válida.',
            'given_names.required' => 'El nombre es obligatorio.',
            'given_names.max' => 'El nombre no debe superar 120 caracteres.',
            'given_names.string' => 'El nombre no es válido.',
            'first_surname.required' => 'El primer apellido es obligatorio.',
            'first_surname.max' => 'El primer apellido no debe superar 120 caracteres.',
            'first_surname.string' => 'El primer apellido no es válido.',
            'second_surname.max' => 'El segundo apellido no debe superar 120 caracteres.',
            'second_surname.string' => 'El segundo apellido no es válido.',
        ];
    }
}
