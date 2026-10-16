<?php

namespace App\Models;

use App\Enums\StudentLinkKind;
use Illuminate\Database\Eloquent\Model;

/** Enlace externo del alumno (HU-S3-01 CA-02): dato protegido, revela su identidad. */
class StudentLink extends Model
{
    protected function casts(): array
    {
        return ['kind' => StudentLinkKind::class];
    }
}
