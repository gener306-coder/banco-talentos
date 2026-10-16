<?php

namespace App\Models;

use App\Support\SocialSecurityNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Seguro facultativo del alumno (HU-S3-02): datos protegidos de uso exclusivo de su institución.
 * El NSS se guarda cifrado; la ruta del comprobante y el índice ciego nunca se serializan.
 */
class StudentSocialSecurity extends Model
{
    protected $table = 'student_social_security';

    protected $hidden = ['nss', 'nss_hash', 'document_path', 'document_sha256'];

    protected function casts(): array
    {
        return [
            'nss' => 'encrypted',
            'document_size' => 'integer',
            'document_uploaded_at' => 'datetime',
        ];
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
