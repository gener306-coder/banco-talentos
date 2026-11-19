<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Evento de la bitácora de cuentas y organizaciones (Sprint 14). Solo guarda los nombres de los campos que cambiaron,
 * nunca sus valores. Es de solo inserción: la base de datos y el modelo impiden editarlo o borrarlo.
 */
class AccountAuditEvent extends Model
{
    public const UPDATED_AT = null;

    public const ACCOUNT_UPDATED = 'account_updated';

    public const PASSWORD_CHANGED = 'password_changed';

    /** HU-S14-02: cambios del perfil de una empresa o institución (sector_code incluido cuando se establece). */
    public const ORGANIZATION_PROFILE_UPDATED = 'organization_profile_updated';

    /** HU-S14-02: la Secretaría invitó a una empresa (alta ligera con la cuenta de su operador). */
    public const COMPANY_INVITED = 'company_invited';

    protected $fillable = [];

    protected function casts(): array
    {
        return ['changed_fields' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Los eventos de la bitácora no se editan.'));
        static::deleting(fn () => throw new LogicException('Los eventos de la bitácora no se borran.'));
    }

    /**
     * Registra un evento. `$subject` es la cuenta, la empresa o la institución afectada; `$fields`, los nombres de los
     * campos que cambiaron (sin valores).
     *
     * @param  list<string>  $fields
     */
    public static function record(User $actor, string $event, User|Company|Institution $subject, array $fields = []): self
    {
        $entry = new self;
        $entry->actor_id = $actor->id;
        $entry->event = $event;
        $entry->subject_type = match (true) {
            $subject instanceof User => 'user',
            $subject instanceof Company => 'company',
            default => 'institution',
        };
        $entry->subject_id = $subject->id;
        $entry->changed_fields = array_values($fields);
        $entry->save();

        return $entry;
    }
}
