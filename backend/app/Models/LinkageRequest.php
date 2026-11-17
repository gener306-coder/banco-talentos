<?php

namespace App\Models;

use App\Enums\LinkageRequestStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Solicitud de vinculación Empresa → Institución (HU-S5-04). Todos sus vínculos los asigna el servidor; student_id
 * nunca forma parte de una respuesta para la empresa; la institución sí lo ve en su bandeja (HU-S6-01).
 */
class LinkageRequest extends Model
{
    protected $fillable = ['message'];

    // La cuenta institucional que respondió (HU-S6-02 CA-04) tampoco sale nunca hacia la empresa.
    // Los marcadores de lectura de la conversación (HU-S13-01) son por lado: ninguno sale hacia el otro.
    protected $hidden = ['student_id', 'responded_by', 'company_last_read_message_id', 'institution_last_read_message_id'];

    protected $attributes = ['status' => 'PENDIENTE_INSTITUCION'];

    protected function casts(): array
    {
        return ['status' => LinkageRequestStatus::class, 'responded_at' => 'datetime', 'last_message_at' => 'datetime'];
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

    /** Cuenta INSTITUTION que respondió (HU-S6-02 CA-03). */
    public function responder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by');
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    /** Conversación de la solicitud aceptada (HU-S13-01). */
    public function messages(): HasMany
    {
        return $this->hasMany(LinkageMessage::class);
    }
}
