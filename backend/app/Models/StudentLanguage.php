<?php

namespace App\Models;

use App\Enums\CvLanguage;
use App\Enums\LanguageLevel;
use Illuminate\Database\Eloquent\Model;

/** Idioma del CV (HU-S3-01) con su nivel MCER o Nativo. Clave compuesta (alumno, idioma). */
class StudentLanguage extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $primaryKey = null;

    protected function casts(): array
    {
        return ['language_code' => CvLanguage::class, 'level' => LanguageLevel::class];
    }
}
