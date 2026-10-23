<?php

namespace App\Models;

use App\Enums\UserRole;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password', 'role', 'is_active', 'institution_id'];

    protected $hidden = ['password', 'remember_token', 'password_setup_required'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role' => UserRole::class,
            'is_active' => 'boolean',
            'password_setup_required' => 'boolean',
        ];
    }

    public function accessRestriction(): ?string
    {
        if ($this->institution_id !== null && ! $this->institution()->where('is_active', true)->exists()) {
            return 'INSTITUTION_INACTIVE';
        }
        // Empresa inactivada por la Secretaría (HU-S4-02 CA-07, HU-S4-03 CA-04).
        if ($this->company_id !== null && ! $this->company()->where('is_active', true)->exists()) {
            return 'COMPANY_INACTIVE';
        }

        return $this->password_setup_required ? 'PASSWORD_SETUP_REQUIRED' : null;
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Cuenta con enlace de configuración en un listado (HU-S4-01 CA-05, HU-S4-03 CA-06): activa, pendiente de su
     * primera contraseña o inactiva. Sin datos de la credencial.
     */
    public function setupAccountSummary(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'status' => ! $this->is_active ? 'inactive' : ($this->password_setup_required ? 'pending' : 'active'),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    /** Usuario que creó la cuenta (HU-S4-01 CA-06); fuera de $fillable, lo asigna el servidor. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(self::class, 'created_by');
    }

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => Str::lower(trim($value)));
    }
}
