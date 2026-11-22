<?php

namespace App\Models;

use App\Enums\LinkageRequestStatus;
use App\Enums\MexicanState;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Oportunidad de Educación Dual de una empresa (HU-S5-02). La empresa, la cuenta creadora, el estado activo y el
 * punto PostGIS los asigna el servidor; el punto no forma parte de ninguna respuesta.
 */
class Opportunity extends Model
{
    use HasFactory;

    /** Datos que captura la empresa (CA-03). Las habilidades y el idioma se guardan aparte. */
    public const DETAIL_ATTRIBUTES = [
        'title', 'program', 'period_number', 'vacancies', 'can_relocate',
        'state_code', 'municipality_code', 'description', 'language_code', 'min_level',
    ];

    protected $fillable = self::DETAIL_ATTRIBUTES;

    protected $hidden = ['location'];

    protected $attributes = ['is_active' => true];

    protected function casts(): array
    {
        return [
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

    public function linkageRequests(): HasMany
    {
        return $this->hasMany(LinkageRequest::class);
    }

    /** T-S14-11: agrega `accepted_count`, los lugares ya cubiertos (solicitudes ACEPTADAS). */
    public function scopeWithAcceptedCount(Builder $query): Builder
    {
        return $query->withCount(['linkageRequests as accepted_count' => fn (Builder $requests) => $requests->where('status', LinkageRequestStatus::ACCEPTED)]);
    }

    /**
     * Lugares cubiertos, leídos de la base. Para decidir con ellos, la oportunidad debe estar bloqueada en la misma
     * transacción (FOR UPDATE al aceptar, FOR SHARE al solicitar); así dos instituciones no cubren el mismo lugar.
     */
    public function acceptedCount(): int
    {
        return $this->linkageRequests()->where('status', LinkageRequestStatus::ACCEPTED)->count();
    }

    /** Lugares cubiertos para una respuesta: el conteo cargado con withAcceptedCount o, sin él, una consulta. */
    public function coveredPlaces(): int
    {
        return (int) ($this->getAttribute('accepted_count') ?? $this->acceptedCount());
    }

    /** Auditoría QA (#6): al aceptar una solicitud de una oportunidad que la empresa inactivó. */
    public const INACTIVE_MESSAGE = 'La oportunidad fue inactivada por la empresa. Puedes rechazar la solicitud.';

    public static function fullMessage(int $vacancies): string
    {
        return $vacancies === 1 ? 'La oportunidad ya cubrió su único lugar.' : "La oportunidad ya cubrió sus {$vacancies} lugares.";
    }

    /** Habilidades requeridas, en el orden que eligió la empresa. */
    public function skills(): BelongsToMany
    {
        return $this->belongsToMany(Skill::class, 'opportunity_skills')->withPivot('position')->orderByPivot('position');
    }
}
