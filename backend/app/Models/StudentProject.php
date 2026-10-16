<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Proyecto del CV (HU-S3-01). Sin enlaces: esos van en StudentLink, que es protegido. */
class StudentProject extends Model
{
    protected function casts(): array
    {
        return ['year' => 'integer'];
    }
}
