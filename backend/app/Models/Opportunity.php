<?php

namespace App\Models;

use App\Enums\AcademicPeriodType;
use App\Enums\MexicanState;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Oportunidad de Educación Dual de una empresa (HU-S5-02). La empresa, la cuenta creadora, el estado activo y el
 * punto PostGIS los asigna el servidor; el punto no forma parte de ninguna respuesta.
 */
class Opportunity extends Model
{
    use HasFactory;

    /** Datos que captura la empresa (CA-03). Las habilidades y el idioma se guardan aparte. */
    public const DETAIL_ATTRIBUTES = [
        'title', 'program', 'period_type', 'period_number', 'vacancies', 'can_relocate',
        'state_code', 'municipality_code', 'description', 'language_code', 'min_level',
    ];

    protected $fillable = self::DETAIL_ATTRIBUTES;

    protected $hidden = ['location'];

    protected $attributes = ['is_active' => true];

    protected function casts(): array
    {
        return [
            'period_type' => AcademicPeriodType::class,
            'period_number' => 'integer',
            'vacancies' => 'integer',
            'can_relocate' => 'boolean',
            'state_code' => MexicanState::class,
            'min_level' => 'integer',
            // Fuera de $fillable: solo cambia por PATCH /opportunities/{id}/status (HU-S5-03).
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function municipality(): BelongsTo
    {
        return $this->belongsTo(Municipality::class, 'municipality_code');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Habilidades requeridas, en el orden que eligió la empresa. */
    public function skills(): BelongsToMany
    {
        return $this->belongsToMany(Skill::class, 'opportunity_skills')->withPivot('position')->orderByPivot('position');
    }
}
