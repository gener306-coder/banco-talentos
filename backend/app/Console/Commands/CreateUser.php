<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Closure;
use Illuminate\Console\Command;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CreateUser extends Command
{
    protected $signature = 'auth:create-user';

    protected $description = 'Crea una cuenta local mediante preguntas interactivas.';

    public function handle(): int
    {
        if (! app()->environment('local') || ! $this->input->isInteractive()) {
            $this->error('Este comando sólo está disponible de forma interactiva en el entorno local.');

            return self::FAILURE;
        }

        $name = $this->ask('Nombre');
        $email = $this->ask('Correo electrónico');
        $role = $this->ask('Rol (ADMIN, INSTITUTION, COMPANY, SECRETARY)');
        $active = $this->ask('¿La cuenta estará activa? (sí/no)');
        $password = $this->secret('Contraseña (mínimo 12 caracteres)', false);
        $confirmation = $this->secret('Confirma la contraseña', false);

        $data = [
            'name' => is_string($name) ? trim($name) : $name,
            'email' => is_string($email) ? Str::lower(trim($email)) : $email,
            'role' => is_string($role) ? trim($role) : $role,
            'active_answer' => is_string($active) ? Str::lower(trim($active)) : $active,
            'password' => $password,
            'password_confirmation' => $confirmation,
        ];
        $validator = Validator::make($data, [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:254', 'unique:users,email'],
            'role' => ['required', Rule::enum(UserRole::class)],
            'active_answer' => ['required', Rule::in(['sí', 'si', 'no'])],
            'password' => [
                'bail', 'required', 'string', 'min:12', 'max:72', 'confirmed',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (strlen($value) > 72 || str_contains($value, chr(0))) {
                        $fail('La contraseña debe ocupar como máximo 72 bytes y no contener caracteres nulos.');
                    }
                },
            ],
        ], [
            'required' => 'El campo :attribute es obligatorio.',
            'role.enum' => 'Debes elegir uno de los cuatro roles indicados.',
            'active_answer.in' => 'Debes indicar sí o no para el estado de la cuenta.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password.min' => 'La contraseña debe tener al menos 12 caracteres.',
            'password.max' => 'La contraseña no debe superar 72 caracteres.',
            'email.unique' => 'El correo electrónico ya está registrado.',
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        try {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => $data['role'],
                'is_active' => in_array($data['active_answer'], ['sí', 'si'], true),
            ]);
        } catch (UniqueConstraintViolationException) {
            $this->error('El correo electrónico ya está registrado.');

            return self::FAILURE;
        }

        $this->info('Cuenta local creada: '.$user->email.' ('.$user->role->value.').');

        return self::SUCCESS;
    }
}
