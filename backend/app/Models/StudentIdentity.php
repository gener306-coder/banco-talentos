<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Identidad protegida del alumno (HU-S2-02 CA-05): solo para uso interno de su institución.
 */
class StudentIdentity extends Model
{
    use HasFactory;

    /** Atributos protegidos: nunca deben incluirse en respuestas para actores distintos de la institución. */
    public const PROTECTED_ATTRIBUTES = ['enrollment_number', 'given_names', 'first_surname', 'second_surname'];

    protected $fillable = ['enrollment_number', 'given_names', 'first_surname', 'second_surname'];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}
