<?php

namespace App\Models;

use App\Enums\LinkageParty;
use App\Enums\LinkageRequestStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Solicitud de vinculación Empresa → Institución (HU-S5-04). Todos sus vínculos los asigna el servidor; student_id
 * nunca forma parte de una respuesta para la empresa; la institución sí lo ve en su bandeja (HU-S6-01).
 */
class LinkageRequest extends Model
{
    protected $fillable = ['message'];

    // La cuenta institucional que respondió (HU-S6-02 CA-04) tampoco sale nunca hacia la empresa.
    // Los marcadores de lectura de la conversación (HU-S13-01) son por lado: ninguno sale hacia el otro.
    protected $hidden = [
        'student_id', 'responded_by', 'company_last_read_message_id', 'institution_last_read_message_id',
        'company_notified_at', 'institution_notified_at', 'terminated_by',
    ];

    protected $attributes = ['status' => 'PENDIENTE_INSTITUCION'];

    protected function casts(): array
    {
        return ['status' => LinkageRequestStatus::class, 'responded_at' => 'datetime', 'last_message_at' => 'datetime',
            'company_notified_at' => 'datetime', 'institution_notified_at' => 'datetime',
            'terminated_at' => 'datetime', 'terminated_party' => LinkageParty::class];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function opportunity(): BelongsTo
    {
        return $this->belongsTo(Opportunity::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    /** Cuenta INSTITUTION que respondió (HU-S6-02 CA-03). */
    public function responder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by');
    }

    /** T-S14-13: cuenta que dio de baja la vinculación; como `responder`, nunca sale hacia el otro lado. */
    public function terminator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'terminated_by');
    }

    /** T-S14-13: datos de la baja para una respuesta, con la cuenta solo si la registró el lado que consulta. */
    public function terminationFor(LinkageParty $viewer): ?array
    {
        if ($this->terminated_at === null) {
            return null;
        }

        return [
            'at' => $this->terminated_at->toISOString(),
            'party' => $this->terminated_party->value,
            'reason' => $this->termination_reason,
            'by' => $this->terminated_party === $viewer && $this->terminator !== null ? ['name' => $this->terminator->name] : null,
        ];
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    /**
     * Mensajes sin leer para un lado (HU-S13-04 CA-01): los del otro lado posteriores a su marcador. Usa el índice
     * (linkage_request_id, id) del hilo.
     */
    private static function unreadMessages(LinkageParty $party): QueryBuilder
    {
        return DB::table('linkage_messages')
            ->whereColumn('linkage_messages.linkage_request_id', 'linkage_requests.id')
            ->where('linkage_messages.sender_party', '<>', $party->value)
            ->whereRaw('linkage_messages.id > COALESCE(linkage_requests.'.$party->readMarkerColumn().', 0)');
    }

    /** Agrega `unread_count` a cada solicitud, para las bandejas (HU-S13-04 CA-02). */
    public function scopeWithUnreadCount(Builder $query, LinkageParty $party): void
    {
        $query->addSelect(['unread_count' => self::unreadMessages($party)->selectRaw('count(*)')]);
    }

    /** Momento de la última actividad (T-S13-09): la solicitud, la respuesta de la institución o el último mensaje. */
    public const ACTIVITY = "GREATEST(linkage_requests.created_at AT TIME ZONE 'UTC', linkage_requests.responded_at, linkage_requests.last_message_at)";

    /** Órdenes de las bandejas (T-S13-09); `activity` es el predeterminado y usa los índices de actividad. */
    public const SORTS = ['activity', 'created_desc', 'created_asc'];

    /** Interacciones del filtro de las bandejas (T-S13-09). */
    public const INTERACTIONS = ['all', 'conversation', 'unread'];

    public function scopeInboxSort(Builder $query, ?string $sort): void
    {
        match ($sort ?? 'activity') {
            'created_desc' => $query->orderByDesc('linkage_requests.created_at')->orderByDesc('linkage_requests.id'),
            'created_asc' => $query->orderBy('linkage_requests.created_at')->orderBy('linkage_requests.id'),
            default => $query->orderByRaw(self::ACTIVITY.' DESC')->orderByDesc('linkage_requests.id'),
        };
    }

    /** Filtro de interacción (T-S13-09): con conversación (algún mensaje, leído o no) o con mensajes sin leer. */
    public function scopeWithInteraction(Builder $query, ?string $interaction, LinkageParty $party): void
    {
        match ($interaction ?? 'all') {
            'conversation' => $query->whereNotNull('linkage_requests.last_message_at'),
            'unread' => $query->withUnread($party),
            default => null,
        };
    }

    /** Agrega `last_unread_id`, el último mensaje sin leer para el lado: el aviso del navegador lo compara (T-S13-08). */
    public function scopeWithLastUnreadId(Builder $query, LinkageParty $party): void
    {
        $query->addSelect(['last_unread_id' => self::unreadMessages($party)->selectRaw('max(linkage_messages.id)')]);
    }

    /** Solo las solicitudes con mensajes sin leer para el lado (HU-S13-04 CA-02, CA-04). */
    public function scopeWithUnread(Builder $query, LinkageParty $party): void
    {
        $query->whereExists(self::unreadMessages($party));
    }

    /** Conversación de la solicitud aceptada (HU-S13-01). */
    /** T-S19-05: fichas compartidas con la empresa; como mucho una vigente. */
    public function disclosures(): HasMany
    {
        return $this->hasMany(StudentDisclosure::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(LinkageMessage::class);
    }
}
