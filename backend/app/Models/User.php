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

        return $this->password_setup_required ? 'PASSWORD_SETUP_REQUIRED' : null;
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => Str::lower(trim($value)));
    }
}
