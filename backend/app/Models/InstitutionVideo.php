<?php

namespace App\Models;

use App\Enums\VideoStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Video promocional del programa dual de una institución (HU-S9-01). La institución, la autoría, el estado y las
 * rutas los asigna el servidor; solo el título y la descripción vienen de la petición. Las rutas internas nunca
 * forman parte de una respuesta. Un video eliminado (T-S9-04) ya no tiene archivos y queda fuera de toda consulta.
 */
class InstitutionVideo extends Model
{
    use SoftDeletes;

    protected $fillable = ['title', 'description'];

    protected $hidden = ['id', 'institution_id', 'created_by', 'deleted_by', 'source_path', 'video_path', 'poster_path'];

    // Igual que los DEFAULT de las columnas, para que un video recién creado los refleje sin recargarse.
    protected $attributes = ['status' => 'PROCESSING', 'is_active' => true];

    protected function casts(): array
    {
        return [
            'status' => VideoStatus::class,
            'duration_seconds' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'original_bytes' => 'integer',
            'output_bytes' => 'integer',
            'is_active' => 'boolean',
            'consent_confirmed_at' => 'datetime',
        ];
    }

    /** Videos que ocupan la cuota de la institución (CA-03): activos y en proceso o listos. */
    public function scopeCountedInQuota(Builder $query): void
    {
        $query->where('is_active', true)->whereIn('status', VideoStatus::COUNTED);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
