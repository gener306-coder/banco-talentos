<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Credencial de una certificación (HU-S3-01 CA-04): dato protegido, porque su página de verificación
 * muestra el nombre del alumno.
 */
class StudentCertificationCredential extends Model
{
    protected $primaryKey = 'certification_id';

    public $incrementing = false;

    protected function casts(): array
    {
        return ['verifiable' => 'boolean'];
    }
}
