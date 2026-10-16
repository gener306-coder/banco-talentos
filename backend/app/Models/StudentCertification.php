<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** Certificación del CV (HU-S3-01). Lo público; la credencial vive aparte como dato protegido. */
class StudentCertification extends Model
{
    /** Campos cuya edición invalida la revisión de la institución (también la credencial). */
    public const REVIEWED_ATTRIBUTES = ['name', 'issuer', 'issued_on', 'expires_on'];

    protected function casts(): array
    {
        return [
            'issued_on' => 'date:Y-m-d',
            'expires_on' => 'date:Y-m-d',
            'verified_at' => 'datetime',
        ];
    }

    public function credential(): HasOne
    {
        return $this->hasOne(StudentCertificationCredential::class, 'certification_id');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
