<?php

namespace App\Models;

use App\Enums\LinkageRequestStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Solicitud de vinculación Empresa → Institución (HU-S5-04). Todos sus vínculos los asigna el servidor; student_id
 * nunca forma parte de una respuesta para la empresa; la institución sí lo ve en su bandeja (HU-S6-01).
 */
class LinkageRequest extends Model
{
    protected $fillable = ['message'];

    protected $hidden = ['student_id'];

    protected $attributes = ['status' => 'PENDIENTE_INSTITUCION'];

    protected function casts(): array
    {
        return ['status' => LinkageRequestStatus::class];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function opportunity(): BelongsTo
    {
        return $this->belongsTo(Opportunity::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
