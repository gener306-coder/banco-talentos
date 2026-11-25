<?php

namespace App\Models;

use App\Enums\SetupDeliveryMethod;
use App\Enums\UserRole;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password', 'role', 'is_active', 'institution_id'];

    protected $hidden = ['password', 'remember_token', 'password_setup_required', 'email_token_hash'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role' => UserRole::class,
            'is_active' => 'boolean',
            'password_setup_required' => 'boolean',
            'email_verified_at' => 'datetime',
            'email_token_sent_at' => 'datetime',
            'setup_delivery' => SetupDeliveryMethod::class,
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
            // T-S19-01: correo probado por un enlace entregado por correo o confirmado desde Mi cuenta.
            'email_verified' => $this->email_verified_at !== null,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    /** Usuario que creó la cuenta (HU-S4-01 CA-06); fuera de $fillable, lo asigna el servidor. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(self::class, 'created_by');
    }

    /**
     * T-S19-01 (D7): registra cómo se entregó el enlace de contraseña recién emitido. Cada enlace invalida el anterior,
     * así que el valor describe el único vigente. Se fija como manual al emitirlo y pasa a email cuando el transporte
     * acepta el correo: si el envío falla, nadie lo recibió en el buzón.
     */
    public function recordLinkDelivery(SetupDeliveryMethod $method): void
    {
        // Dato de control del enlace, no una edición de la cuenta: no cambia updated_at ni otros atributos pendientes.
        DB::table('users')->where('id', $this->id)->update(['setup_delivery' => $method->value]);
        $this->setAttribute('setup_delivery', $method);
        $this->syncOriginalAttribute('setup_delivery');
    }

    /** T-S19-01: completar un enlace enviado por correo prueba el buzón; uno manual no (D7). */
    public function verifyEmailIfLinkWasEmailed(): void
    {
        if ($this->setup_delivery === SetupDeliveryMethod::EMAIL && $this->email_verified_at === null) {
            $this->email_verified_at = now();
        }
    }

    /** T-S19-03 y T-S19-04: descarta el correo pendiente y el enlace de confirmación vigente. */
    public function forgetEmailToken(): void
    {
        $this->forceFill(['pending_email' => null, 'email_token_hash' => null, 'email_token_sent_at' => null]);
    }

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => Str::lower(trim($value)));
    }

    protected function pendingEmail(): Attribute
    {
        return Attribute::make(set: fn (?string $value): ?string => $value === null ? null : Str::lower(trim($value)));
    }
}
