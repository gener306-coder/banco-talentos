<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * T-S19-05: ficha que la institución comparte con la empresa tras aceptar la vinculación (D1 a D4).
 *
 * La lista blanca es la única fuente de lo que puede salir hacia la empresa (D2): el nombre completo, los enlaces
 * externos y las credenciales de las certificaciones. Nunca la matrícula, el seguro (ninguna columna ni indicador),
 * students.id, la ubicación ni quién revisó una certificación. `sharedProfile()` arma la respuesta con campos
 * explícitos y solo de los grupos compartidos.
 */
class StudentDisclosure extends Model
{
    /** D2: grupos compartibles, en el orden en que se muestran. */
    public const SHAREABLE = ['full_name', 'links', 'credentials'];

    public const REVOKED_BY_INSTITUTION = 'institution';

    public const REVOKED_BY_TERMINATION = 'termination';

    public $timestamps = false;

    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'fields' => 'array',
            'consent_confirmed_at' => 'datetime',
            'disclosed_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function scopeActive(Builder $query): void
    {
        $query->whereNull('revoked_at');
    }

    public function linkageRequest(): BelongsTo
    {
        return $this->belongsTo(LinkageRequest::class);
    }

    public function discloser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'disclosed_by');
    }

    /** Deja de compartirse, una sola vez: por la institución o por la baja de la vinculación (D4). */
    public function revoke(User $by, string $reason): void
    {
        $this->revoked_by = $by->id;
        $this->revoked_at = now();
        $this->revoked_reason = $reason;
        $this->save();
    }

    /**
     * Datos de la ficha para la empresa, leídos en vivo y solo de los grupos compartidos. Cada consulta nombra sus
     * columnas: ninguna lee la matrícula, el seguro ni la ubicación.
     *
     * @return array<string, mixed>
     */
    public function sharedProfile(): array
    {
        $fields = array_values(array_intersect(self::SHAREABLE, $this->fields));
        $data = ['fields' => $fields, 'disclosed_at' => $this->disclosed_at->toISOString()];

        if (in_array('full_name', $fields, true)) {
            $identity = StudentIdentity::query()->where('student_id', $this->student_id)->first(['given_names', 'first_surname', 'second_surname']);
            $data['full_name'] = $identity === null ? null
                : trim(implode(' ', array_filter([$identity->given_names, $identity->first_surname, $identity->second_surname])));
        }
        if (in_array('links', $fields, true)) {
            $data['links'] = StudentLink::query()->where('student_id', $this->student_id)->orderBy('position')->get(['kind', 'url'])
                ->filter(fn (StudentLink $link): bool => self::isWebUrl($link->url))
                ->map(fn (StudentLink $link): array => ['kind' => $link->kind->value, 'url' => $link->url])->values()->all();
        }
        if (in_array('credentials', $fields, true)) {
            $data['credentials'] = StudentCertification::query()
                ->join('student_certification_credentials as credentials', 'credentials.certification_id', '=', 'student_certifications.id')
                ->where('student_certifications.student_id', $this->student_id)
                ->orderBy('student_certifications.position')
                ->get(['student_certifications.name', 'student_certifications.issuer', 'credentials.credential_id', 'credentials.credential_url'])
                ->map(fn (StudentCertification $certification): array => [
                    'name' => $certification->name,
                    'issuer' => $certification->issuer,
                    'credential_id' => $certification->credential_id,
                    'credential_url' => self::isWebUrl($certification->credential_url) ? $certification->credential_url : null,
                ])->values()->all();
        }

        return $data;
    }

    /** Solo http(s): un enlace con otro esquema no sale hacia la empresa. */
    private static function isWebUrl(?string $url): bool
    {
        return $url !== null && preg_match('#^https?://#i', $url) === 1;
    }
}
