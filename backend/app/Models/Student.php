<?php

namespace App\Models;

use App\Enums\AcademicPeriodType;
use App\Enums\MexicanState;
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

    /** Expediente público (HU-S2-03); la institución nunca se asigna desde la petición. */
    public const PROFILE_ATTRIBUTES = ['program', 'period_type', 'period_number', 'dual_available', 'state_code', 'municipality', 'can_relocate'];

    protected $fillable = self::PROFILE_ATTRIBUTES;

    // Punto aproximado (PostGIS) derivado del estado en el servidor; no forma parte de ninguna respuesta.
    protected $hidden = ['location'];

    // Igual que el DEFAULT de la columna, para que un alumno recién creado lo refleje sin recargarse.
    protected $attributes = ['is_active' => true];

    protected function casts(): array
    {
        return [
            'period_type' => AcademicPeriodType::class,
            'period_number' => 'integer',
            'dual_available' => 'boolean',
            'state_code' => MexicanState::class,
            'can_relocate' => 'boolean',
            // Baja lógica (HU-S2-04); fuera de $fillable: solo cambia por PATCH /students/{id}/status.
            'is_active' => 'boolean',
        ];
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function identity(): HasOne
    {
        return $this->hasOne(StudentIdentity::class);
    }

    public function socialSecurity(): HasOne
    {
        return $this->hasOne(StudentSocialSecurity::class);
    }
}
