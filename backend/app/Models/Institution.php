<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Institution extends Model
{
    use HasFactory;

    /** HU-S16-05: nombre para quien la administra o la ve mientras la institución invitada no captura el suyo. */
    public const UNNAMED = 'Institución sin nombre';

    /** HU-S16-08 (D6): mínimo para operar (hacer buscable a un alumno, subir un video y aceptar una solicitud). */
    public const MINIMUM = ['name', 'cct', 'contact_name', 'contact_email'];

    protected $fillable = ['name', 'cct', 'contact_name', 'contact_position', 'contact_email', 'contact_phone'];

    protected $attributes = ['is_active' => true];

    // Identificador de la galería de promoción dual (HU-S9-03); no cambia las respuestas de administración.
    protected $hidden = ['public_id'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'onboarding_dismissed_at' => 'immutable_datetime',
        ];
    }

    /** Nombre oficial, o null si la institución invitada aún no lo captura. Para sus propias vistas y /api/me. */
    public function displayName(): ?string
    {
        return $this->name;
    }

    /** Nombre con respaldo para los textos hacia otros actores (correos, chat, búsqueda, reportes): nunca vacío. */
    public function label(): string
    {
        return $this->displayName() ?? self::UNNAMED;
    }

    /**
     * Claves de `$required` que faltan, en su orden.
     *
     * @param  list<string>  $required
     * @return list<string>
     */
    public function missing(array $required = self::MINIMUM): array
    {
        return array_values(array_filter($required, fn (string $key): bool => $this->{$key} === null));
    }

    /** Sin cuenta que ya haya creado su contraseña, la institución aún no ha entrado: «Acceso pendiente». */
    public function profileStatus(bool $accessed): string
    {
        return match (true) {
            ! $accessed => 'pending_access',
            $this->missing() !== [] => 'incomplete',
            default => 'complete',
        };
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
