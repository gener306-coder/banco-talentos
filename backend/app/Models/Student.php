<?php

namespace App\Models;

use App\Enums\AcademicPeriodType;
use App\Enums\MexicanState;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Expediente público del alumno. La matrícula y el nombre viven en StudentIdentity,
 * para que las consultas de otros actores (empresas) no puedan alcanzarlos por accidente.
 */
class Student extends Model
{
    use HasFactory;

    /**
     * Expediente público (HU-S2-03); la institución nunca se asigna desde la petición. Desde HU-S4-04 el municipio
     * es una clave del catálogo INEGI; legacy_municipality conserva el texto libre anterior pendiente de confirmar.
     */
    public const PROFILE_ATTRIBUTES = ['program', 'period_type', 'period_number', 'dual_available', 'state_code', 'municipality_code', 'can_relocate'];

    protected $fillable = self::PROFILE_ATTRIBUTES;

    // Punto aproximado (PostGIS) derivado del municipio en el servidor; no forma parte de ninguna respuesta.
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

    /**
     * Alumno ACTIVO con el expediente público capturado y su punto (HU-S4-05 CA-02). El buscador añade que la
     * institución esté activa; el inicio por rol (HU-S5-01) reutiliza la misma condición para sus conteos.
     */
    public function scopeSearchable(Builder $query): void
    {
        $query->where('students.is_active', true)
            ->whereNotNull(['students.program', 'students.period_type', 'students.period_number', 'students.dual_available',
                'students.state_code', 'students.can_relocate', 'students.location']);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function municipality(): BelongsTo
    {
        return $this->belongsTo(Municipality::class, 'municipality_code');
    }

    public function identity(): HasOne
    {
        return $this->hasOne(StudentIdentity::class);
    }

    public function socialSecurity(): HasOne
    {
        return $this->hasOne(StudentSocialSecurity::class);
    }

    /** CV normalizado (HU-S3-01): parte pública, en el orden que eligió la institución. */
    public function skills(): BelongsToMany
    {
        return $this->belongsToMany(Skill::class, 'student_skills')->withPivot('position')->orderByPivot('position');
    }

    public function languages(): HasMany
    {
        return $this->hasMany(StudentLanguage::class)->orderBy('position');
    }

    public function certifications(): HasMany
    {
        return $this->hasMany(StudentCertification::class)->orderBy('position');
    }

    public function projects(): HasMany
    {
        return $this->hasMany(StudentProject::class)->orderBy('position');
    }

    /** Parte protegida del CV (CA-02): nunca para empresas sin un match. */
    public function links(): HasMany
    {
        return $this->hasMany(StudentLink::class)->orderBy('position');
    }
}
