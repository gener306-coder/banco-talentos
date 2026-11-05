<?php

namespace App\Models;

use App\Enums\InsuranceType;
use App\Support\SocialSecurityNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Seguro del alumno (HU-S3-02, T-S8-07): datos protegidos de uso exclusivo de su institución.
 * El NSS y la póliza se guardan cifrados; la ruta del comprobante y el índice ciego nunca se serializan.
 */
class StudentSocialSecurity extends Model
{
    protected $table = 'student_social_security';

    protected $hidden = ['nss', 'nss_hash', 'policy_number', 'document_path', 'document_sha256'];

    /** Igual que el valor por omisión de la columna: un registro nuevo se presenta sin volver a leerlo. */
    protected $attributes = ['insurance_type' => 'IMSS'];

    protected function casts(): array
    {
        return [
            'insurance_type' => InsuranceType::class,
            'nss' => 'encrypted',
            'policy_number' => 'encrypted',
            'document_size' => 'integer',
            'document_uploaded_at' => 'datetime',
        ];
    }

    /** El seguro está completo con su número o con el comprobante en PDF (T-S8-07). No descifra el número. */
    public function hasProof(): bool
    {
        return $this->nss_hash !== null || $this->getRawOriginal('policy_number') !== null || $this->document_path !== null;
    }

    protected static function booted(): void
    {
        // El índice ciego se recalcula siempre desde el NSS: nunca lo asigna la petición.
        static::saving(function (StudentSocialSecurity $record): void {
            if ($record->isDirty('nss')) {
                $record->nss_hash = $record->nss === null ? null : SocialSecurityNumber::blindIndex($record->nss);
            }
        });
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}
