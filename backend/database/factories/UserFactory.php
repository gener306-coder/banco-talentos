<?php

namespace Database\Factories;

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<User> */
class UserFactory extends Factory
{
    protected $model = User::class;

    public function definition(): array
    {
        return [
            'name' => 'Cuenta de prueba',
            'email' => Str::uuid().'@example.test',
            'password' => 'Password123!',
            'role' => UserRole::INSTITUTION,
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }

    public function role(UserRole $role): static
    {
        return $this->state(fn (): array => ['role' => $role]);
    }

    public function forInstitution(Institution $institution): static
    {
        return $this->state(fn (): array => [
            'institution_id' => $institution->id,
            'role' => UserRole::INSTITUTION,
        ]);
    }

    protected function withFaker()
    {
        // Los datos de esta factory no necesitan Faker.
        return null;
    }
}
