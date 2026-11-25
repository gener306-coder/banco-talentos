<?php

namespace App\Http\Controllers;

use App\Enums\AuditEventType;
use App\Http\Requests\ListAuditEventsRequest;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\StudentDisclosure;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Bitácora de trazabilidad para ADMIN (HU-S7-03). Une en una sola consulta paginada las columnas de autoría que ya
 * registra el sistema y, desde HU-S14-04, los eventos de account_audit_events. Describe cada evento con una lista
 * explícita de campos públicos: nunca contraseñas, tokens, hashes, NSS, la identidad del alumno ni los valores de los
 * campos que cambiaron (solo sus nombres).
 */
class AuditEventController extends Controller
{
    private const PER_PAGE = 30;

    /** Origen de cada tipo: tabla, columna del actor y columna de la fecha. */
    private const SOURCES = [
        'account_created' => ['users', 'created_by', 'created_at'],
        'company_registered' => ['companies', 'registered_by', 'created_at'],
        'opportunity_created' => ['opportunities', 'created_by', 'created_at'],
        'linkage_requested' => ['linkage_requests', 'requested_by', 'created_at'],
        'linkage_responded' => ['linkage_requests', 'responded_by', 'responded_at'],
        // T-S19-05: ficha compartida con la empresa y cuándo dejó de compartirse (por la institución o por la baja).
        'student_disclosed' => ['student_disclosures', 'disclosed_by', 'disclosed_at'],
        'student_disclosure_revoked' => ['student_disclosures', 'revoked_by', 'revoked_at'],
    ];

    /** HU-S14-04: eventos de la tabla inmutable; su subject_id en la unión es el id del evento. */
    private const ACCOUNT_EVENTS = [
        'account_updated', 'password_changed', 'organization_profile_updated', 'company_invited',
        'admin_bootstrapped', 'password_reset_issued', 'email_changed', 'account_status_changed', 'institution_invited',
    ];

    /** CA-02: de la más reciente a la más antigua, de 30 en 30, con filtro opcional por tipo. */
    public function index(ListAuditEventsRequest $request): JsonResponse
    {
        $type = $request->validated('type');
        $types = $type === null ? AuditEventType::values() : [$type];

        $union = null;
        foreach ($types as $name) {
            $query = $this->source($name);
            $union = $union === null ? $query : $union->unionAll($query);
        }

        $page = DB::query()->fromSub($union, 'events')
            ->orderByDesc('occurred_at')
            ->orderByDesc('subject_id')
            ->orderBy('type')
            ->paginate(self::PER_PAGE);

        $events = collect($page->items());

        return response()->json([
            'data' => $this->present($events),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'per_page' => self::PER_PAGE,
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    private function source(string $type): Builder
    {
        if (in_array($type, self::ACCOUNT_EVENTS, true)) {
            return DB::table('account_audit_events')
                ->selectRaw('event::text AS type, created_at AS occurred_at, actor_id, id AS subject_id')
                ->where('event', $type);
        }
        [$table, $actor, $date] = self::SOURCES[$type];

        return DB::table($table)
            // $type, $date y $actor vienen de SOURCES, nunca de la petición.
            ->selectRaw("'{$type}'::text AS type, {$date}::timestamptz AS occurred_at, {$actor} AS actor_id, id AS subject_id")
            ->whereNotNull($actor)
            ->whereNotNull($date);
    }

    /** CA-03: actor y recurso cargados por lotes para la página, con campos explícitos. */
    private function present(Collection $events): array
    {
        $ids = fn (string ...$types) => $events->whereIn('type', $types)->pluck('subject_id')->unique()->values();

        $actors = User::query()->whereIn('id', $events->pluck('actor_id')->filter()->unique())->get(['id', 'name', 'role'])->keyBy('id');
        $accounts = User::query()->whereIn('id', $ids('account_created'))->get(['id', 'name', 'email', 'role'])->keyBy('id');
        $companies = Company::query()->whereIn('id', $ids('company_registered'))->get(['id', 'legal_name', 'trade_name'])->keyBy('id');
        $opportunities = Opportunity::query()->whereIn('id', $ids('opportunity_created'))->get(['id', 'title'])->keyBy('id');
        $changes = AccountAuditEvent::query()->whereIn('id', $ids(...self::ACCOUNT_EVENTS))
            ->get(['id', 'subject_type', 'subject_id', 'changed_fields'])->keyBy('id');
        $subjects = fn (string $type) => $changes->where('subject_type', $type)->pluck('subject_id')->unique()->values();
        $changedUsers = User::query()->whereIn('id', $subjects('user'))->get(['id', 'name', 'role'])->keyBy('id');
        $changedCompanies = Company::query()->whereIn('id', $subjects('company'))->get(['id', 'legal_name', 'trade_name'])->keyBy('id');
        $changedInstitutions = Institution::query()->whereIn('id', $subjects('institution'))->get(['id', 'name'])->keyBy('id');
        $disclosures = StudentDisclosure::query()->whereIn('id', $ids('student_disclosed', 'student_disclosure_revoked'))
            ->get(['id', 'linkage_request_id', 'fields', 'revoked_reason'])->keyBy('id');
        $linkages = LinkageRequest::query()->whereIn('id', $ids('linkage_requested', 'linkage_responded')->merge($disclosures->pluck('linkage_request_id'))->unique())
            ->with(['institution:id,name', 'company:id,legal_name,trade_name'])
            ->get(['id', 'status', 'institution_id', 'company_id'])
            ->keyBy('id');

        $change = function (AccountAuditEvent $change) use ($changedUsers, $changedCompanies, $changedInstitutions): array {
            $subject = match ($change->subject_type) {
                'user' => ['name' => $changedUsers[$change->subject_id]->name, 'role' => $changedUsers[$change->subject_id]->role->value],
                'company' => ['name' => $changedCompanies[$change->subject_id]->label()],
                default => ['name' => $changedInstitutions[$change->subject_id]->label()],
            };

            // Solo los nombres de los campos, en su orden; nunca sus valores.
            return ['subject_type' => $change->subject_type, 'id' => $change->subject_id, ...$subject, 'fields' => array_values($change->changed_fields ?? [])];
        };

        return $events->map(function (object $event) use ($actors, $accounts, $companies, $opportunities, $linkages, $changes, $change, $disclosures): array {
            // D3: los eventos de la consola del servidor no tienen cuenta como actor.
            $actor = $event->actor_id === null ? null : $actors[$event->actor_id];

            return [
                'type' => $event->type,
                'occurred_at' => Carbon::parse($event->occurred_at)->toISOString(),
                'actor' => $actor === null ? null : ['id' => $actor->id, 'name' => $actor->name, 'role' => $actor->role->value],
                'resource' => match ($event->type) {
                    'account_created' => $this->account($accounts[$event->subject_id]),
                    'company_registered' => ['id' => $event->subject_id, 'name' => $companies[$event->subject_id]->label()],
                    'opportunity_created' => ['id' => $event->subject_id, 'title' => $opportunities[$event->subject_id]->title],
                    'account_updated', 'password_changed', 'organization_profile_updated', 'company_invited',
                    'admin_bootstrapped', 'password_reset_issued', 'email_changed', 'account_status_changed', 'institution_invited' => $change($changes[$event->subject_id]),
                    // Solo la solicitud y los grupos compartidos; nunca los datos del alumno.
                    'student_disclosed', 'student_disclosure_revoked' => [
                        ...$this->linkage($linkages[$disclosures[$event->subject_id]->linkage_request_id]),
                        'fields' => array_values($disclosures[$event->subject_id]->fields),
                        'reason' => $event->type === 'student_disclosure_revoked' ? $disclosures[$event->subject_id]->revoked_reason : null,
                    ],
                    default => $this->linkage($linkages[$event->subject_id]),
                },
            ];
        })->values()->all();
    }

    private function account(User $account): array
    {
        return ['id' => $account->id, 'name' => $account->name, 'email' => $account->email, 'role' => $account->role->value];
    }

    /** Solicitud por su folio, institución y empresa; nunca el alumno. */
    private function linkage(LinkageRequest $linkage): array
    {
        return [
            'id' => $linkage->id,
            'status' => $linkage->status->value,
            'institution' => $linkage->institution->label(),
            'company' => $linkage->company->label(),
        ];
    }
}
