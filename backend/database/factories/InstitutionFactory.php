<?php

namespace Database\Factories;

use App\Models\Institution;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Institution> */
class InstitutionFactory extends Factory
{
    protected $model = Institution::class;

    public function definition(): array
    {
        return [
            'name' => 'Institución de prueba',
            'cct' => (string) Str::uuid(),
            'contact_email' => 'contacto@example.test',
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }

    protected function withFaker()
    {
        // Los datos de esta factory no necesitan Faker.
        return null;
    }
}
