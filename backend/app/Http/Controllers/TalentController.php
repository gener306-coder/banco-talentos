<?php

namespace App\Http\Controllers;

use App\Http\Requests\TalentSearchRequest;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentCertification;
use App\Models\StudentLanguage;
use App\Models\StudentProject;
use App\Support\CatalogSlug;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Buscador de talento anónimo para las empresas (HU-S4-05), vista exploratoria sin «Contactar».
 *
 * Privacidad (CA-07): solo lee students y las tablas públicas del CV; nunca student_identities, el seguro facultativo,
 * los enlaces ni las credenciales. Las respuestas se arman con listas explícitas de campos (card(), profile()) y el
 * alumno se identifica por public_id, nunca por students.id (CA-08).
 */
class TalentController extends Controller
{
    private const PER_PAGE = 20;

    /** Habilidades que muestra la tarjeta; el perfil las muestra todas. */
    private const CARD_SKILLS = 6;

    public function index(TalentSearchRequest $request): JsonResponse
    {
        $filters = $request->validated();
        $origin = $filters['origin_municipality_code'] ?? $this->companyMunicipality($request);
        $query = $this->universe($origin);

        if (! $this->applyFilters($query, $filters, $request, $origin)) {
            return $this->page(collect(), 1, 1, 0);
        }

        // CA-09: más cercanos primero y, a igual distancia, los perfiles actualizados más recientemente.
        $page = $query->orderBy('distance_m')->orderByDesc('students.updated_at')->orderBy('students.id')
            ->paginate(self::PER_PAGE);

        return $this->page(
            $page->getCollection()->map(fn (Student $student): array => $this->card($student)),
            $page->currentPage(), $page->lastPage(), $page->total(),
        );
    }

    public function show(Request $request, string $publicId): JsonResponse
    {
        $student = $this->universe($this->companyMunicipality($request))
            ->where('students.public_id', $publicId)
            ->with([
                'certifications' => fn ($query) => $query->select(['id', 'student_id', 'name', 'issuer', 'issued_on', 'expires_on', 'verified_at', 'position']),
                'projects' => fn ($query) => $query->select(['id', 'student_id', 'title', 'description', 'role', 'year', 'position']),
            ])
            ->first();

        // Inexistente, inactivo, de una institución inactiva o sin expediente: la misma respuesta (CA-08).
        abort_if($student === null, 404, 'El perfil no existe.');

        return response()->json(['data' => $this->profile($student)])->header('Cache-Control', 'no-store, private');
    }

    /**
     * Origen por defecto del radio: el municipio de la empresa de la cuenta. Una cuenta COMPANY sin empresa solo
     * puede existir en una base local anterior a HU-S4-03 (restricción NOT VALID): no busca.
     */
    private function companyMunicipality(Request $request): string
    {
        $company = $request->user()->company;
        abort_if($company === null, 403);

        return $company->municipality_code;
    }

    /**
     * Universo buscable (CA-02): alumno ACTIVO, de una institución activa y con el expediente público capturado.
     * La distancia se mide en metros (geography) desde la cabecera del municipio de origen.
     */
    private function universe(string $origin): Builder
    {
        return Student::query()
            ->join('institutions', 'institutions.id', '=', 'students.institution_id')
            ->where('institutions.is_active', true)
            ->searchable()
            ->select('students.*')
            ->selectRaw('ST_Distance(students.location, (SELECT location FROM municipalities WHERE code = ?)) AS distance_m', [$origin])
            ->withCount(['certifications as verified_certifications_count' => fn ($query) => $query->whereNotNull('verified_at')])
            ->with([
                'institution:id,name',
                'municipality:code,name',
                'skills:id,name,kind',
                'languages' => fn ($query) => $query->select(['student_id', 'language_code', 'level', 'position']),
            ]);
    }

    /**
     * Un EXISTS por filtro sobre los índices del CV (HU-S3-01). Devuelve false si una habilidad pedida no existe en
     * el catálogo: con habilidades combinadas con AND, ningún alumno puede cumplir el filtro.
     */
    private function applyFilters(Builder $query, array $filters, Request $request, string $origin): bool
    {
        $slugs = collect($filters['skills'] ?? [])->map(fn (string $name) => CatalogSlug::from($name))->filter()->unique();
        if ($slugs->isNotEmpty()) {
            $ids = Skill::query()->whereIn('slug', $slugs->all())->pluck('id');
            if ($ids->count() !== $slugs->count()) {
                return false;
            }
            foreach ($ids as $skillId) {
                $query->whereExists(fn ($exists) => $exists->selectRaw('1')->from('student_skills')
                    ->where('student_skills.skill_id', $skillId)->whereColumn('student_skills.student_id', 'students.id'));
            }
        }

        if (isset($filters['language'])) {
            $query->whereExists(fn ($exists) => $exists->selectRaw('1')->from('student_languages')
                ->where('student_languages.language_code', $filters['language'])
                ->where('student_languages.level', '>=', (int) $filters['min_level'])
                ->whereColumn('student_languages.student_id', 'students.id'));
        }

        if (filled($filters['program'] ?? null)) {
            // Literal: % y _ escritos por la empresa no son comodines.
            $query->whereRaw('lower(students.program) LIKE ?', ['%'.addcslashes(mb_strtolower(trim($filters['program'])), '\\%_').'%']);
        }

        if (isset($filters['min_period'])) {
            $query->where('students.period_number', '>=', (int) $filters['min_period']);
        }

        foreach (['dual_available', 'can_relocate'] as $flag) {
            if (isset($filters[$flag])) {
                $query->where('students.'.$flag, $request->boolean($flag));
            }
        }

        if ($request->boolean('verified_certification')) {
            $query->whereExists(fn ($exists) => $exists->selectRaw('1')->from('student_certifications')
                ->whereNotNull('student_certifications.verified_at')->whereColumn('student_certifications.student_id', 'students.id'));
        }

        if (isset($filters['state_code'])) {
            $query->where('students.state_code', $filters['state_code']);
        }

        if (isset($filters['radius_km'])) {
            // ST_DWithin sobre geography usa el índice GiST students_location_gist.
            $query->whereRaw(
                'ST_DWithin(students.location, (SELECT location FROM municipalities WHERE code = ?), ?)',
                [$origin, (int) $filters['radius_km'] * 1000],
            );
        }

        return true;
    }

    private function page($items, int $current, int $last, int $total): JsonResponse
    {
        return response()->json([
            'data' => $items->values(),
            'meta' => ['current_page' => $current, 'last_page' => $last, 'total' => $total, 'per_page' => self::PER_PAGE],
        ])->header('Cache-Control', 'no-store, private');
    }

    /** Tarjeta anónima (CA-05): lista explícita de campos públicos. */
    private function card(Student $student): array
    {
        return [
            'public_id' => $student->public_id,
            'headline' => $student->headline,
            'program' => $student->program,
            'period_type' => $student->period_type->value,
            'period_number' => $student->period_number,
            // Decisión del responsable (nota de privacidad de sprint-4.md): la tarjeta muestra la institución.
            'institution' => $student->institution->name,
            'state_code' => $student->state_code->value,
            'municipality' => $student->municipality?->name,
            'distance_km' => self::roundedDistance((float) $student->distance_m),
            'skills' => $student->skills->take(self::CARD_SKILLS)->map(fn (Skill $skill): array => ['name' => $skill->name, 'kind' => $skill->kind->value])->values(),
            'languages' => $student->languages->map(fn (StudentLanguage $language): array => ['language_code' => $language->language_code, 'level' => $language->level])->values(),
            'verified_certifications' => (int) $student->verified_certifications_count,
            'dual_available' => $student->dual_available,
            'can_relocate' => $student->can_relocate,
        ];
    }

    /** Perfil público completo (CA-06): la tarjeta más el CV público, sin quién revisó ni credenciales. */
    private function profile(Student $student): array
    {
        return [
            ...$this->card($student),
            'skills' => $student->skills->map(fn (Skill $skill): array => ['name' => $skill->name, 'kind' => $skill->kind->value])->values(),
            'certifications' => $student->certifications->map(fn (StudentCertification $certification): array => [
                'name' => $certification->name,
                'issuer' => $certification->issuer,
                'issued_on' => $certification->issued_on?->format('Y-m-d'),
                'expires_on' => $certification->expires_on?->format('Y-m-d'),
                'verified' => $certification->verified_at !== null,
            ])->values(),
            'projects' => $student->projects->map(fn (StudentProject $project): array => [
                'title' => $project->title,
                'description' => $project->description,
                'role' => $project->role,
                'year' => $project->year,
            ])->values(),
        ];
    }

    /** CA-04: distancia en múltiplos de 5 km; 0 significa «a menos de 5 km». */
    public static function roundedDistance(float $meters): int
    {
        return (int) (round($meters / 1000 / 5) * 5);
    }
}
