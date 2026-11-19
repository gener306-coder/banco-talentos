<?php

namespace App\Models;

use App\Enums\EconomicSector;
use App\Enums\MexicanState;
use App\Rules\Rfc;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Empresa validada por la Secretaría de Economía (HU-S4-02). El punto PostGIS (location) es interno: lo deriva
 * el servidor del municipio y no forma parte de ninguna respuesta.
 *
 * Desde HU-S14-02 la Secretaría la invita solo con el correo de su cuenta: todo el perfil es opcional y lo captura
 * la propia empresa. Cualquier consumidor debe tolerar los campos en null.
 */
class Company extends Model
{
    use HasFactory;

    /** Datos que captura la Secretaría; el estado, el punto y quien la registró los asigna el servidor. */
    public const DETAIL_ATTRIBUTES = [
        'legal_name', 'trade_name', 'rfc', 'sector_code', 'state_code', 'municipality_code',
        'contact_name', 'contact_position', 'contact_email', 'contact_phone', 'validation_reference',
    ];

    protected $fillable = self::DETAIL_ATTRIBUTES;

    protected $hidden = ['location'];

    protected $attributes = ['is_active' => true];

    /** Texto para las vistas de la Secretaría y la bitácora cuando la empresa aún no captura ningún nombre. */
    public const UNNAMED = 'Empresa sin nombre';

    /** M1: lo necesario para publicar oportunidades y enviar solicitudes (el nombre es comercial o razón social). */
    public const MINIMUM = ['name', 'contact_name', 'contact_email'];

    /** Perfil completo: el mínimo más los datos fiscales, el sector y la ubicación. El puesto y el teléfono siguen opcionales. */
    public const PROFILE = [...self::MINIMUM, 'legal_name', 'rfc', 'sector_code', 'location'];

    protected function casts(): array
    {
        return [
            'sector_code' => EconomicSector::class,
            'state_code' => MexicanState::class,
            'is_active' => 'boolean',
            'onboarding_dismissed_at' => 'immutable_datetime',
        ];
    }

    public function municipality(): BelongsTo
    {
        return $this->belongsTo(Municipality::class, 'municipality_code');
    }

    /** Cuentas COMPANY de la empresa (HU-S4-03). */
    public function accounts(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function registrar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    protected function rfc(): Attribute
    {
        // Un RFC vacío no existe: se guarda null (HU-S14-02).
        return Attribute::make(set: fn (?string $value): ?string => blank($value) ? null : Rfc::normalize($value));
    }

    /** Nombre visible: el comercial o, sin él, la razón social. Null si la empresa aún no captura ninguno. */
    public function displayName(): ?string
    {
        return $this->trade_name ?? $this->legal_name;
    }

    /** Nombre visible con respaldo para quien la administra: nunca vacío. */
    public function label(): string
    {
        return $this->displayName() ?? self::UNNAMED;
    }

    /**
     * Claves de `$required` que faltan, en su orden. `name` se cumple con el nombre comercial o la razón social y
     * `location` con el municipio.
     *
     * @param  list<string>  $required
     * @return list<string>
     */
    public function missing(array $required = self::PROFILE): array
    {
        return array_values(array_filter($required, fn (string $key): bool => match ($key) {
            'name' => $this->displayName() === null,
            'location' => $this->municipality_code === null,
            default => $this->{$key} === null,
        }));
    }

    /** Sin cuenta que ya haya creado su contraseña, la empresa aún no ha entrado: «Acceso pendiente». */
    public function profileStatus(bool $accessed): string
    {
        return match (true) {
            ! $accessed => 'pending_access',
            $this->missing() !== [] => 'incomplete',
            default => 'complete',
        };
    }
}
