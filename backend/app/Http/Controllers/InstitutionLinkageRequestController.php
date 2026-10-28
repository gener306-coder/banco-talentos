<?php

namespace App\Http\Controllers;

use App\Enums\LinkageRequestStatus;
use App\Http\Requests\DecideLinkageRequestRequest;
use App\Http\Requests\ListInstitutionLinkageRequestsRequest;
use App\Models\Company;
use App\Models\LinkageRequest;
use App\Models\Skill;
use App\Models\Student;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Bandeja institucional de solicitudes de vinculación (HU-S6-01): las que las empresas enviaron para alumnos de la
 * institución de la sesión, con la identidad interna del alumno para evaluarlas. Esa identidad y el indicador del
 * seguro facultativo son de uso exclusivo de la institución; nunca forman parte de una respuesta para la empresa.
 * La institución responde las pendientes con ACEPTADA o RECHAZADA (HU-S6-02).
 */
class InstitutionLinkageRequestController extends Controller
{
    private const PER_PAGE = 20;

    private const STUDENT_COLUMNS = 'student:id,is_active,program,period_type,period_number,dual_available,state_code,municipality_code,can_relocate';

    /** CA-03, CA-04: de la más reciente a la más antigua, con filtro opcional por estado. */
    public function index(ListInstitutionLinkageRequestsRequest $request): JsonResponse
    {
        $status = $request->validated('status');

        $page = $this->owned($request)
            ->when($status !== null, fn (Builder $query) => $query->where('status', $status))
            ->with([
                'company:id,legal_name,trade_name,municipality_code',
                'company.municipality:code,name',
                'opportunity:id,title,program,vacancies',
                self::STUDENT_COLUMNS,
                'student.identity',
            ])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
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

    /** CA-05: detalle completo para evaluar la solicitud. Una ajena responde igual que una inexistente (CA-02). */
    public function show(Request $request, string $linkageRequest): JsonResponse
    {
        $linkage = $this->owned($request)->find((int) $linkageRequest);
        abort_if($linkage === null, 404, 'La solicitud no existe.');

        return $this->detail($linkage);
    }

    /**
     * Respuesta institucional (HU-S6-02 CA-01 a CA-03): solo una solicitud propia y PENDIENTE_INSTITUCION. La fila se
     * bloquea para que la empresa no la cancele a la vez; una ajena o inexistente responde 404 y una que ya no está
     * pendiente, 422, sin cambios.
     */
    public function decide(DecideLinkageRequestRequest $request, string $linkageRequest): JsonResponse
    {
        $validated = $request->validated();

        $linkage = DB::transaction(function () use ($request, $linkageRequest, $validated): LinkageRequest {
            $linkage = $this->owned($request)->lockForUpdate()->find((int) $linkageRequest);
            abort_if($linkage === null, 404, 'La solicitud no existe.');

            if ($linkage->status !== LinkageRequestStatus::PENDING_INSTITUTION) {
                throw ValidationException::withMessages(['status' => ['Solo puedes responder solicitudes pendientes.']]);
            }
            $linkage->status = LinkageRequestStatus::from($validated['status']);
            $linkage->response_message = $validated['response_message'] ?? null;
            $linkage->responded_by = $request->user()->id;
            $linkage->responded_at = now();
            $linkage->save();

            return $linkage;
        });

        return $this->detail($linkage);
    }

    private function detail(LinkageRequest $linkage): JsonResponse
    {
        $linkage->load([
            'company.municipality:code,name',
            'opportunity.municipality:code,name',
            'opportunity.skills:id,name,kind',
            self::STUDENT_COLUMNS,
            'student.identity',
            'student.municipality:code,name',
            // Solo las columnas que dicen si hay NSS y comprobante; nunca su valor ni la ruta del PDF.
            'student.socialSecurity:id,student_id,nss_hash,document_path',
            'responder:id,name',
        ]);

        $item = $this->item($linkage);
        $company = $linkage->company;
        $opportunity = $linkage->opportunity;
        $student = $linkage->student;
        $socialSecurity = $student->socialSecurity;

        return response()->json(['data' => [
            ...$item,
            'message' => $linkage->message,
            'company' => [
                ...$item['company'],
                'legal_name' => $company->legal_name,
                'trade_name' => $company->trade_name,
                'sector_code' => $company->sector_code->value,
                'state_code' => $company->state_code->value,
                'contact_name' => $company->contact_name,
                'contact_email' => $company->contact_email,
                'contact_phone' => $company->contact_phone,
            ],
            'opportunity' => [
                ...$item['opportunity'],
                'period_type' => $opportunity->period_type->value,
                'period_number' => $opportunity->period_number,
                'can_relocate' => $opportunity->can_relocate,
                'state_code' => $opportunity->state_code->value,
                'municipality' => $opportunity->municipality?->name,
                'description' => $opportunity->description,
                'skills' => $opportunity->skills->map(fn (Skill $skill): array => ['name' => $skill->name, 'kind' => $skill->kind->value])->values(),
                'language_code' => $opportunity->language_code,
                'min_level' => $opportunity->min_level,
                'is_active' => $opportunity->is_active,
            ],
            'student' => [
                ...$item['student'],
                'dual_available' => $student->dual_available,
                'state_code' => $student->state_code?->value,
                'municipality' => $student->municipality?->name,
                'can_relocate' => $student->can_relocate,
                'social_security' => [
                    'has_nss' => $socialSecurity?->nss_hash !== null,
                    'has_document' => $socialSecurity?->document_path !== null,
                ],
            ],
            // Respuesta (HU-S6-02 CA-05): la cuenta que respondió solo la ve la institución.
            'responded_at' => $linkage->responded_at?->toISOString(),
            'response_message' => $linkage->response_message,
            'responded_by' => $linkage->responder === null ? null : ['name' => $linkage->responder->name],
        ]])->header('Cache-Control', 'no-store, private');
    }

    /** Anti-IDOR (CA-02): siempre dentro de la institución de la sesión. */
    private function owned(Request $request): Builder
    {
        return LinkageRequest::query()->where('institution_id', $request->user()->institution_id);
    }

    /** Elemento del listado (CA-04): lista explícita de campos. */
    private function item(LinkageRequest $linkage): array
    {
        return [
            'id' => $linkage->id,
            'status' => $linkage->status->value,
            'created_at' => $linkage->created_at?->toISOString(),
            'company' => $this->companySummary($linkage->company),
            'opportunity' => [
                'id' => $linkage->opportunity->id,
                'title' => $linkage->opportunity->title,
                'program' => $linkage->opportunity->program,
                'vacancies' => $linkage->opportunity->vacancies,
            ],
            'student' => $this->studentSummary($linkage->student),
        ];
    }

    private function companySummary(Company $company): array
    {
        return ['name' => $company->trade_name ?? $company->legal_name, 'municipality' => $company->municipality?->name];
    }

    private function studentSummary(Student $student): array
    {
        return [
            'id' => $student->id,
            'enrollment_number' => $student->identity->enrollment_number,
            'given_names' => $student->identity->given_names,
            'first_surname' => $student->identity->first_surname,
            'second_surname' => $student->identity->second_surname,
            'is_active' => $student->is_active,
            'program' => $student->program,
            'period_type' => $student->period_type?->value,
            'period_number' => $student->period_number,
        ];
    }
}
