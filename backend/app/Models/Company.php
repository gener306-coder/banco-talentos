<?php

namespace App\Models;

use App\Enums\EconomicSector;
use App\Enums\MexicanState;
use App\Rules\Rfc;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Empresa validada por la Secretaría de Economía (HU-S4-02). El punto PostGIS (location) es interno: lo deriva
 * el servidor del municipio y no forma parte de ninguna respuesta.
 */
class Company extends Model
{
    use HasFactory;

    /** Datos que captura la Secretaría; el estado, el punto y quien la registró los asigna el servidor. */
    public const DETAIL_ATTRIBUTES = [
        'legal_name', 'trade_name', 'rfc', 'sector_code', 'state_code', 'municipality_code',
        'contact_name', 'contact_email', 'contact_phone', 'validation_reference',
    ];

    protected $fillable = self::DETAIL_ATTRIBUTES;

    protected $hidden = ['location'];

    protected $attributes = ['is_active' => true];

    protected function casts(): array
    {
        return [
            'sector_code' => EconomicSector::class,
            'state_code' => MexicanState::class,
            'is_active' => 'boolean',
        ];
    }

    public function municipality(): BelongsTo
    {
        return $this->belongsTo(Municipality::class, 'municipality_code');
    }

    public function registrar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    protected function rfc(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => Rfc::normalize($value));
    }
}
