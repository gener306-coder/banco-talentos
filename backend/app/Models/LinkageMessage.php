<?php

namespace App\Models;

use App\Enums\LinkageParty;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Mensaje de la conversación de una solicitud aceptada (HU-S13-01). Todos sus vínculos los asigna el servidor. Es de
 * solo inserción: el modelo y un trigger de la base de datos impiden editarlo o borrarlo. La cuenta que lo escribió
 * nunca sale hacia el otro lado.
 */
class LinkageMessage extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['body'];

    protected $hidden = ['sender_user_id'];

    protected function casts(): array
    {
        return ['sender_party' => LinkageParty::class, 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Los mensajes de vinculación no se editan.'));
        static::deleting(fn () => throw new LogicException('Los mensajes de vinculación no se borran.'));
    }

    public function linkageRequest(): BelongsTo
    {
        return $this->belongsTo(LinkageRequest::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }
}
