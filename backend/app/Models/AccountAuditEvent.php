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

    /** HU-S16-06: Administración invitó a una institución (alta ligera con la cuenta de su persona). */
    public const INSTITUTION_INVITED = 'institution_invited';

    /** HU-S16-01: primer Administrador creado desde la consola del servidor. */
    public const ADMIN_BOOTSTRAPPED = 'admin_bootstrapped';

    /** HU-S16-04: enlace de restablecimiento emitido desde la consola. */
    public const PASSWORD_RESET_ISSUED = 'password_reset_issued';

    /** HU-S16-04: correo de acceso de un Administrador corregido desde la consola (sin los valores). */
    public const EMAIL_CHANGED = 'email_changed';

    /** HU-S16-02 (D8): cuenta inactivada o reactivada; el campo que cambió es is_active. */
    public const ACCOUNT_STATUS_CHANGED = 'account_status_changed';

    /** D3: quién originó el evento: una cuenta desde la interfaz o la consola del servidor (sin cuenta). */
    public const ACTOR_USER = 'user';

    public const ACTOR_CLI = 'cli';

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
        return self::write($actor, $event, $subject, $fields);
    }

    /**
     * D3: evento de la consola del servidor, sin cuenta como actor. La bitácora lo muestra como «Consola del servidor».
     *
     * @param  list<string>  $fields
     */
    public static function recordFromConsole(string $event, User|Company|Institution $subject, array $fields = []): self
    {
        return self::write(null, $event, $subject, $fields);
    }

    /** @param  list<string>  $fields */
    private static function write(?User $actor, string $event, User|Company|Institution $subject, array $fields): self
    {
        $entry = new self;
        $entry->actor_id = $actor?->id;
        $entry->actor_kind = $actor === null ? self::ACTOR_CLI : self::ACTOR_USER;
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
