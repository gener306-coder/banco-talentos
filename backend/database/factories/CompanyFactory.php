<?php

namespace Database\Factories;

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Company> */
class CompanyFactory extends Factory
{
    protected $model = Company::class;

    public function definition(): array
    {
        return [
            'legal_name' => 'Empresa de Prueba, S.A. de C.V.',
            // Persona moral con homoclave aleatoria: único entre empresas de la misma prueba.
            'rfc' => 'EPR010101'.strtoupper(Str::random(3)),
            'sector_code' => '54',
            'state_code' => '28',
            'municipality_code' => '28041',
            'contact_name' => 'Responsable del programa dual',
            'contact_email' => 'dual@empresa.test',
            'registered_by' => fn () => User::factory()->role(UserRole::SECRETARY),
        ];
    }

    public function configure(): static
    {
        // El punto lo deriva siempre el servidor del municipio, igual que en la API.
        return $this->afterMaking(function (Company $company): void {
            $company->location = Company::locationOf($company->municipality_code);
        });
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
