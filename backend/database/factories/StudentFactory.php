<?php

namespace Database\Factories;

use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentIdentity;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Student> */
class StudentFactory extends Factory
{
    protected $model = Student::class;

    public function definition(): array
    {
        return ['institution_id' => Institution::factory()];
    }

    /** Crea también su identidad protegida en la misma institución. */
    public function withIdentity(array $identity = []): static
    {
        return $this->afterCreating(function (Student $student) use ($identity): void {
            $record = new StudentIdentity(array_replace([
                'enrollment_number' => strtoupper(Str::random(8)),
                'given_names' => 'Alumna',
                'first_surname' => 'De Prueba',
                'second_surname' => null,
            ], $identity));
            $record->student_id = $student->id;
            $record->institution_id = $student->institution_id;
            $record->save();
        });
    }

    protected function withFaker()
    {
        // Los datos de esta factory no necesitan Faker.
        return null;
    }
}
