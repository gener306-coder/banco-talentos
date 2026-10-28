<?php

namespace App\Http\Controllers;

use App\Http\Requests\OpportunityRequest;
use App\Models\Municipality;
use App\Models\Opportunity;
use App\Models\Skill;
use App\Support\SkillCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Oportunidades de Educación Dual de la empresa de la sesión (HU-S5-02). Anti-IDOR (CA-02): toda consulta filtra
 * por company_id de la sesión y una oportunidad ajena responde igual que una inexistente. Sin DELETE: la baja
 * lógica pertenece a HU-S5-03.
 */
class OpportunityController extends Controller
{
    private const PER_PAGE = 20;

    /** Habilidades que muestra el listado; el detalle las muestra todas. */
    private const SUMMARY_SKILLS = 5;

    public function index(Request $request): JsonResponse
    {
        // CA-06: de la más reciente a la más antigua; el id desempata altas del mismo segundo.
        $page = Opportunity::query()
            ->where('company_id', $request->user()->company_id)
            ->with(['municipality:code,name', 'skills:id,name,kind'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Opportunity $opportunity): array => [
                ...$this->summary($opportunity),
                'skills' => $this->skills($opportunity)->take(self::SUMMARY_SKILLS)->values(),
            ])->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'per_page' => self::PER_PAGE,
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    /** Ubicación precargada en el alta: la de la empresa de la sesión (CA-05). */
    public function defaults(Request $request): JsonResponse
    {
        $company = $request->user()->company()->with('municipality:code,name')->firstOrFail();

        return response()->json(['data' => [
            'state_code' => $company->state_code->value,
            'municipality_code' => $company->municipality_code,
            'municipality' => $company->municipality?->name,
        ]])->header('Cache-Control', 'no-store, private');
    }

    public function store(OpportunityRequest $request): JsonResponse
    {
        $opportunity = new Opportunity;
        // CA-02: la empresa y la autoría las asigna el servidor, nunca la petición.
        $opportunity->company_id = $request->user()->company_id;
        $opportunity->created_by = $request->user()->id;
        $this->save($opportunity, $request);

        return $this->detail($opportunity, 201);
    }

    public function show(Request $request, string $opportunity): JsonResponse
    {
        return $this->detail($this->owned($request, $opportunity));
    }

    public function update(OpportunityRequest $request, string $opportunity): JsonResponse
    {
        $record = $this->owned($request, $opportunity);
        $this->save($record, $request);

        return $this->detail($record);
    }

    private function owned(Request $request, string $id): Opportunity
    {
        $opportunity = Opportunity::query()
            ->where('company_id', $request->user()->company_id)
            ->find((int) $id);

        abort_if($opportunity === null, 404, 'La oportunidad no existe.');

        return $opportunity;
    }

    /**
     * Guarda los datos, el punto y las habilidades en una transacción. PUT reemplaza la oportunidad completa: sin
     * habilidades ni idioma en la petición, quedan vacíos.
     */
    private function save(Opportunity $opportunity, OpportunityRequest $request): void
    {
        $validated = $request->validated();
        $opportunity->fill([
            ...Arr::only($validated, Opportunity::DETAIL_ATTRIBUTES),
            'language_code' => $validated['language_code'] ?? null,
            'min_level' => $validated['min_level'] ?? null,
        ]);
        // CA-05: el punto de la cabecera se guarda en la misma sentencia que el municipio.
        if ($opportunity->isDirty('municipality_code') || ! $opportunity->exists) {
            $opportunity->location = Municipality::locationOf($opportunity->municipality_code);
        }
        $skills = SkillCatalog::normalize($validated['skills'] ?? []);

        DB::transaction(function () use ($opportunity, $skills): void {
            $opportunity->save();
            $ids = SkillCatalog::ids($skills);
            DB::table('opportunity_skills')->where('opportunity_id', $opportunity->id)->delete();
            DB::table('opportunity_skills')->insert($skills->map(fn (array $skill, int $position): array => [
                'opportunity_id' => $opportunity->id,
                'skill_id' => $ids[$skill['slug']],
                'position' => $position,
            ])->all());
        });
        $opportunity->refresh();
    }

    private function skills(Opportunity $opportunity)
    {
        return $opportunity->skills->map(fn (Skill $skill): array => ['name' => $skill->name, 'kind' => $skill->kind->value]);
    }

    /** Lista explícita de campos: nunca el punto, la empresa ni otros datos internos. */
    private function summary(Opportunity $opportunity): array
    {
        return [
            'id' => $opportunity->id,
            'title' => $opportunity->title,
            'program' => $opportunity->program,
            'state_code' => $opportunity->state_code->value,
            'municipality_code' => $opportunity->municipality_code,
            'municipality' => $opportunity->municipality?->name,
            'vacancies' => $opportunity->vacancies,
            'is_active' => $opportunity->is_active,
            'created_at' => $opportunity->created_at?->toISOString(),
        ];
    }

    private function detail(Opportunity $opportunity, int $status = 200): JsonResponse
    {
        $opportunity->loadMissing(['municipality:code,name', 'skills:id,name,kind', 'creator:id,name']);

        return response()->json(['data' => [
            ...$this->summary($opportunity),
            'period_type' => $opportunity->period_type->value,
            'period_number' => $opportunity->period_number,
            'can_relocate' => $opportunity->can_relocate,
            'description' => $opportunity->description,
            'skills' => $this->skills($opportunity)->values(),
            'language_code' => $opportunity->language_code,
            'min_level' => $opportunity->min_level,
            // CA-02: cuenta COMPANY que la registró.
            'created_by' => ['id' => $opportunity->creator->id, 'name' => $opportunity->creator->name],
            'updated_at' => $opportunity->updated_at?->toISOString(),
        ]], $status)->header('Cache-Control', 'no-store, private');
    }
}
