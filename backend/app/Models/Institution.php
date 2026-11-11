<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Institution extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'cct', 'contact_name', 'contact_position', 'contact_email', 'contact_phone'];

    protected $attributes = ['is_active' => true];

    // Identificador de la galería de promoción dual (HU-S9-03); no cambia las respuestas de administración.
    protected $hidden = ['public_id'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    /** Solicitudes de vinculación recibidas para sus alumnos (HU-S5-04). */
    public function linkageRequests(): HasMany
    {
        return $this->hasMany(LinkageRequest::class);
    }
}
