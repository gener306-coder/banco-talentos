<?php

namespace App\Models;

use App\Enums\SkillKind;
use Illuminate\Database\Eloquent\Model;

/** Habilidad del catálogo compartido (HU-S3-01). No contiene datos personales. */
class Skill extends Model
{
    protected function casts(): array
    {
        // aliases: abreviaturas normalizadas con las que también se busca la habilidad (T-S10-01).
        return ['kind' => SkillKind::class, 'aliases' => 'array'];
    }
}
