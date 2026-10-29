<?php

namespace App\Http\Controllers;

use App\Enums\AuditEventType;
use App\Http\Requests\ListAuditEventsRequest;
use App\Models\Company;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Bitácora de trazabilidad para ADMIN (HU-S7-03). Une en una sola consulta paginada las columnas de autoría que ya
 * registra el sistema y describe cada evento con una lista explícita de campos públicos: nunca contraseñas, tokens,
 * hashes, NSS ni la identidad del alumno.
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

        $actors = User::query()->whereIn('id', $events->pluck('actor_id')->unique())->get(['id', 'name', 'role'])->keyBy('id');
        $accounts = User::query()->whereIn('id', $ids('account_created'))->get(['id', 'name', 'email', 'role'])->keyBy('id');
        $companies = Company::query()->whereIn('id', $ids('company_registered'))->get(['id', 'legal_name'])->keyBy('id');
        $opportunities = Opportunity::query()->whereIn('id', $ids('opportunity_created'))->get(['id', 'title'])->keyBy('id');
        $linkages = LinkageRequest::query()->whereIn('id', $ids('linkage_requested', 'linkage_responded'))
            ->with(['institution:id,name', 'company:id,legal_name,trade_name'])
            ->get(['id', 'status', 'institution_id', 'company_id'])
            ->keyBy('id');

        return $events->map(function (object $event) use ($actors, $accounts, $companies, $opportunities, $linkages): array {
            $actor = $actors[$event->actor_id];

            return [
                'type' => $event->type,
                'occurred_at' => Carbon::parse($event->occurred_at)->toISOString(),
                'actor' => ['id' => $actor->id, 'name' => $actor->name, 'role' => $actor->role->value],
                'resource' => match ($event->type) {
                    'account_created' => $this->account($accounts[$event->subject_id]),
                    'company_registered' => ['id' => $event->subject_id, 'legal_name' => $companies[$event->subject_id]->legal_name],
                    'opportunity_created' => ['id' => $event->subject_id, 'title' => $opportunities[$event->subject_id]->title],
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
            'institution' => $linkage->institution->name,
            'company' => $linkage->company->trade_name ?? $linkage->company->legal_name,
        ];
    }
}
