<?php

namespace App\Http\Controllers;

use App\Enums\LinkageParty;
use App\Enums\LinkageRequestStatus;
use App\Http\Controllers\Concerns\RequiresOperableCompany;
use App\Http\Controllers\Concerns\TerminatesLinkage;
use App\Http\Requests\ListLinkageRequestsRequest;
use App\Http\Requests\StoreLinkageRequestRequest;
use App\Http\Requests\TerminateLinkageRequestRequest;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Support\InboxSearch;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Solicitudes de vinculación directas de la empresa a la institución del alumno (HU-S5-04), sin la Secretaría, y su
 * bandeja con cancelación (HU-S5-05).
 * Privacidad (CA-05): la respuesta identifica al alumno solo por su public_id y nunca lee sus datos protegidos.
 */
class LinkageRequestController extends Controller
{
    use RequiresOperableCompany;
    use TerminatesLinkage;

    private const DUPLICATE = 'Ya enviaste una solicitud para este perfil en esa oportunidad.';

    /** T-S12-07: la institución ya respondió esa pareja de perfil y oportunidad; la empresa puede usar otra oportunidad. */
    private const REJECTED = 'La institución ya rechazó una solicitud de este perfil para esa oportunidad. Elige otra oportunidad.';

    private const PER_PAGE = 20;

    /**
     * Bandeja de la empresa (HU-S5-05 CA-01, CA-02): solo sus solicitudes, de la más reciente a la más antigua, con
     * filtro por estado o por perfil anónimo (CA-04). El alumno aparece con su resumen público y la institución con
     * su contacto para coordinar fuera de la plataforma; nunca su identidad ni datos protegidos.
     */
    public function index(ListLinkageRequestsRequest $request): JsonResponse
    {
        $filters = $request->validated();

        $page = LinkageRequest::query()
            ->where('company_id', $request->user()->company_id)
            ->when(isset($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when(isset($filters['public_id']), fn ($query) => $query->whereHas(
                'student', fn ($student) => $student->where('public_id', $filters['public_id'])))
            ->withInteraction($filters['interaction'] ?? null, LinkageParty::COMPANY)
            ->tap(fn ($query) => $this->search($query, $filters['q'] ?? null))
            ->withUnreadCount(LinkageParty::COMPANY)
            ->with([
                'opportunity:id,title,is_active',
                'student:id,public_id,headline,program,period_type,period_number',
                'institution:id,name,contact_name,contact_position,contact_email,contact_phone',
                'terminator:id,name',
            ])
            ->inboxSort($filters['sort'] ?? null)
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => $page->getCollection()->map(fn (LinkageRequest $linkage): array => $this->item($linkage))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'per_page' => self::PER_PAGE,
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * Detalle de la solicitud para la empresa (HU-S13-02 CA-01): la misma lista explícita de campos de la bandeja. Una
     * solicitud ajena o inexistente responde 404 idéntico.
     */
    public function show(Request $request, string $linkageRequest): JsonResponse
    {
        $linkage = LinkageRequest::query()
            ->where('company_id', $request->user()->company_id)
            ->withUnreadCount(LinkageParty::COMPANY)
            ->with([
                'opportunity:id,title,is_active',
                'student:id,public_id,headline,program,period_type,period_number',
                'institution:id,name,contact_name,contact_position,contact_email,contact_phone',
                'terminator:id,name',
            ])
            ->find((int) $linkageRequest);
        abort_if($linkage === null, 404, 'La solicitud no existe.');

        // T-S19-05: fecha de la ficha compartida vigente, solo con la vinculación aceptada; los datos se piden aparte.
        $shared = $linkage->status === LinkageRequestStatus::ACCEPTED ? $linkage->disclosures()->active()->value('disclosed_at') : null;

        return response()->json(['data' => [...$this->item($linkage), 'shared_profile_at' => $shared === null ? null : Carbon::parse($shared)->toISOString()]])
            ->header('Cache-Control', 'no-store, private');
    }

    /**
     * Cancelación (CA-03): solo una solicitud propia y PENDIENTE_INSTITUCION. Una ajena o inexistente responde 404;
     * una que ya no está pendiente, 422. La fila se bloquea para que la institución no la responda a la vez.
     */
    public function cancel(Request $request, string $linkageRequest): JsonResponse
    {
        $linkage = DB::transaction(function () use ($request, $linkageRequest): LinkageRequest {
            $linkage = LinkageRequest::query()
                ->where('company_id', $request->user()->company_id)
                ->lockForUpdate()
                ->find((int) $linkageRequest);
            abort_if($linkage === null, 404, 'La solicitud no existe.');

            if ($linkage->status !== LinkageRequestStatus::PENDING_INSTITUTION) {
                throw ValidationException::withMessages(['status' => ['Solo puedes cancelar solicitudes pendientes de la institución.']]);
            }
            $linkage->status = LinkageRequestStatus::CANCELLED;
            $linkage->save();

            return $linkage;
        });

        $linkage->load(['opportunity:id,title,is_active', 'student:id,public_id,headline,program,period_type,period_number', 'institution:id,name,contact_name,contact_position,contact_email,contact_phone', 'terminator:id,name']);

        return response()->json(['data' => $this->item($linkage)])->header('Cache-Control', 'no-store, private');
    }

    /** T-S14-13: la empresa da de baja una vinculación aceptada (p. ej., el alumno no se presentó); libera el lugar. */
    public function terminate(TerminateLinkageRequestRequest $request, string $linkageRequest): JsonResponse
    {
        $user = $request->user();
        $linkage = $this->terminateLinkage($user, LinkageParty::COMPANY, (int) $user->company_id, $linkageRequest, $request->validated('reason'));

        return $this->show($request, (string) $linkage->id);
    }

    public function store(StoreLinkageRequestRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        try {
            $linkage = DB::transaction(function () use ($user, $validated): LinkageRequest {
                // HU-S14-03 (M1): la institución debe saber quién la busca y cómo responderle.
                $this->ensureOperableCompany($user->company_id);
                // CA-03: el mismo universo del buscador (HU-S4-05); fuera de él, el perfil «no existe».
                $student = Student::query()
                    ->join('institutions', 'institutions.id', '=', 'students.institution_id')
                    ->where('institutions.is_active', true)
                    ->searchable()
                    ->where('students.public_id', $validated['student_public_id'])
                    ->select(['students.id', 'students.institution_id', 'students.public_id'])
                    ->first();
                abort_if($student === null, 404, 'El perfil no existe.');

                // Una oportunidad ajena se rechaza igual que una inexistente. FOR SHARE impide que se inactive
                // mientras se registra la solicitud.
                $opportunity = Opportunity::query()
                    ->where('company_id', $user->company_id)
                    ->sharedLock()
                    ->find($validated['opportunity_id']);
                if ($opportunity === null) {
                    throw ValidationException::withMessages(['opportunity_id' => ['La oportunidad no existe.']]);
                }
                if (! $opportunity->is_active) {
                    throw ValidationException::withMessages(['opportunity_id' => ['Solo puedes usar oportunidades activas. Reactívala o elige otra.']]);
                }
                // T-S14-11: con el cupo lleno no se envían más solicitudes. FOR SHARE sobre la oportunidad espera a una
                // aceptación en curso (FOR UPDATE), así que el conteo es el definitivo.
                if ($opportunity->acceptedCount() >= $opportunity->vacancies) {
                    throw ValidationException::withMessages(['opportunity_id' => [
                        Opportunity::fullMessage($opportunity->vacancies).' Amplía los lugares para enviar más solicitudes.',
                    ]]);
                }

                $duplicate = LinkageRequest::query()
                    ->where('company_id', $user->company_id)
                    ->where('student_id', $student->id)
                    ->where('opportunity_id', $opportunity->id)
                    ->whereIn('status', LinkageRequestStatus::ACTIVE)
                    ->exists();
                if ($duplicate) {
                    throw ValidationException::withMessages(['opportunity_id' => [self::DUPLICATE]]);
                }

                // T-S12-07: un rechazo es definitivo para la misma oportunidad (una cancelada sí puede reenviarse). No hace
                // falta índice: RECHAZADA es un estado final, así que no hay carrera que proteger.
                $rejected = LinkageRequest::query()
                    ->where('company_id', $user->company_id)
                    ->where('student_id', $student->id)
                    ->where('opportunity_id', $opportunity->id)
                    ->where('status', LinkageRequestStatus::REJECTED)
                    ->exists();
                if ($rejected) {
                    throw ValidationException::withMessages(['opportunity_id' => [self::REJECTED]]);
                }

                // CA-04: trato directo, pendiente de la institución del alumno.
                $linkage = new LinkageRequest(['message' => $validated['message'] ?? null]);
                $linkage->company_id = $user->company_id;
                $linkage->opportunity_id = $opportunity->id;
                $linkage->student_id = $student->id;
                $linkage->institution_id = $student->institution_id;
                $linkage->requested_by = $user->id;
                $linkage->status = LinkageRequestStatus::PENDING_INSTITUTION;
                $linkage->save();

                return $linkage->setRelation('opportunity', $opportunity)->setRelation('student', $student);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos envíos simultáneos: el índice único parcial es la última garantía (CA-03).
            if ($exception->index !== 'linkage_requests_active_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['opportunity_id' => [self::DUPLICATE]]);
        }

        return response()->json(['data' => $this->summary($linkage)], 201)->header('Cache-Control', 'no-store, private');
    }

    /** Elemento de la bandeja (HU-S5-05 CA-02): lista explícita de campos públicos. */
    /**
     * T-S13-09: la empresa busca por la institución, la oportunidad y el titular público del perfil. Nunca por datos
     * del alumno: no se consulta student_identities (nombre, apellidos, matrícula) ni ningún dato protegido.
     */
    private function search(Builder $query, ?string $q): void
    {
        foreach (InboxSearch::patterns($q) as $pattern) {
            $query->where(fn (Builder $match) => $match
                ->whereHas('institution', fn (Builder $institution) => $institution->whereRaw(InboxSearch::matches('institutions.name'), [$pattern]))
                ->orWhereHas('opportunity', fn (Builder $opportunity) => $opportunity->whereRaw(InboxSearch::matches('opportunities.title'), [$pattern]))
                ->orWhereHas('student', fn (Builder $student) => $student->whereRaw('students.headline_search LIKE talent_search_text(?)', [$pattern])));
        }
    }

    private function item(LinkageRequest $linkage): array
    {
        $student = $linkage->student;

        return [
            'id' => $linkage->id,
            'status' => $linkage->status->value,
            'created_at' => $linkage->created_at?->toISOString(),
            'message' => $linkage->message,
            // T-S15-03: con la oportunidad inactiva, la institución no puede aceptar la solicitud (auditoría QA #6); la
            // empresa lo ve en el detalle. Mismo campo en la bandeja y el detalle (HU-S13-02 CA-01).
            'opportunity' => ['id' => $linkage->opportunity->id, 'title' => $linkage->opportunity->title, 'is_active' => (bool) $linkage->opportunity->is_active],
            'profile' => [
                'public_id' => $student->public_id,
                'headline' => $student->headline,
                'program' => $student->program,
                'period_type' => $student->period_type?->value,
                'period_number' => $student->period_number,
            ],
            'institution' => [
                'name' => $linkage->institution->label(),
                // T-S8-11: responsable de la institución; null en las registradas antes de pedirlo.
                'contact_name' => $linkage->institution->contact_name,
                'contact_position' => $linkage->institution->contact_position,
                'contact_email' => $linkage->institution->contact_email,
                'contact_phone' => $linkage->institution->contact_phone,
            ],
            // Respuesta de la institución (HU-S6-02 CA-04), sin la cuenta que respondió.
            'responded_at' => $linkage->responded_at?->toISOString(),
            'response_message' => $linkage->response_message,
            // T-S14-13: la baja, con la cuenta solo si la registró la empresa.
            'termination' => $linkage->terminationFor(LinkageParty::COMPANY),
            // HU-S13-04 CA-02: mensajes de la institución sin leer; una solicitud recién cancelada no tiene conversación.
            'unread_count' => (int) ($linkage->getAttribute('unread_count') ?? 0),
            // T-S13-09: último mensaje del hilo, para explicar el orden por actividad.
            'last_message_at' => $linkage->last_message_at?->toISOString(),
        ];
    }

    /** Lista explícita de campos: el alumno solo por su public_id (CA-05). */
    private function summary(LinkageRequest $linkage): array
    {
        return [
            'id' => $linkage->id,
            'status' => $linkage->status->value,
            'student_public_id' => $linkage->student->public_id,
            'opportunity' => ['id' => $linkage->opportunity->id, 'title' => $linkage->opportunity->title],
            'message' => $linkage->message,
            'created_at' => $linkage->created_at?->toISOString(),
        ];
    }
}
