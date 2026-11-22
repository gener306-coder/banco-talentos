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
            // HU-S16-08: completa por defecto (los 4 datos mínimos), para que las pruebas existentes puedan operar.
            'contact_name' => 'Coordinación de prueba',
            'contact_email' => 'contacto@example.test',
        ];
    }

    /** HU-S16-06: institución invitada que aún no captura su perfil. */
    public function invited(): static
    {
        return $this->state(fn (): array => ['name' => null, 'cct' => null, 'contact_name' => null, 'contact_email' => null, 'onboarding_dismissed_at' => null]);
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
