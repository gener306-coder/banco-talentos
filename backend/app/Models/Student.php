<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Expediente público del alumno. La matrícula y el nombre viven en StudentIdentity,
 * para que las consultas de otros actores (empresas) no puedan alcanzarlos por accidente.
 */
class Student extends Model
{
    use HasFactory;

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function identity(): HasOne
    {
        return $this->hasOne(StudentIdentity::class);
    }
}
