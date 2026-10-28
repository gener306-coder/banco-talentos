<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\FindsOwnedStudent;
use App\Http\Requests\UpdateCertificationVerificationRequest;
use App\Http\Requests\UpdateStudentCertificationsRequest;
use App\Http\Requests\UpdateStudentHeadlineRequest;
use App\Http\Requests\UpdateStudentLanguagesRequest;
use App\Http\Requests\UpdateStudentLinksRequest;
use App\Http\Requests\UpdateStudentProjectsRequest;
use App\Http\Requests\UpdateStudentSkillsRequest;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentCertification;
use App\Models\StudentCertificationCredential;
use App\Rules\SafeHttpsUrl;
use App\Support\CatalogSlug;
use App\Support\SkillCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * CV normalizado (HU-S3-01) de un alumno propio. Cada sección se guarda por separado y reemplaza su
 * contenido completo en una transacción. La respuesta separa lo público de lo protegido (CA-02).
 */
class StudentCvController extends Controller
{
    use FindsOwnedStudent;

    private const RELATIONS = ['skills', 'languages', 'certifications.credential', 'certifications.verifier', 'projects', 'links'];

    public function show(Request $request, string $student): JsonResponse
    {
        return $this->present($this->owned($request, $student, self::RELATIONS));
    }

    public function updateHeadline(UpdateStudentHeadlineRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, []);
        $headline = $request->validated('headline');
        $record->headline = $headline === null ? null : CatalogSlug::displayName($headline);
        $record->save();

        return $this->fresh($record);
    }

    public function updateSkills(UpdateStudentSkillsRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, []);
        $skills = SkillCatalog::normalize($request->validated('skills'));

        DB::transaction(function () use ($record, $skills): void {
            $ids = SkillCatalog::ids($skills);
            DB::table('student_skills')->where('student_id', $record->id)->delete();
            DB::table('student_skills')->insert($skills->map(fn (array $skill, int $position): array => [
                'student_id' => $record->id,
                'institution_id' => $record->institution_id,
                'skill_id' => $ids[$skill['slug']],
                'position' => $position,
            ])->all());
        });

        return $this->fresh($record);
    }

    public function updateLanguages(UpdateStudentLanguagesRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, []);
        $languages = collect($request->validated('languages'));

        DB::transaction(function () use ($record, $languages): void {
            DB::table('student_languages')->where('student_id', $record->id)->delete();
            DB::table('student_languages')->insert($languages->map(fn (array $language, int $position): array => [
                'student_id' => $record->id,
                'institution_id' => $record->institution_id,
                'language_code' => $language['language_code'],
                'level' => $language['level'],
                'position' => $position,
            ])->all());
        });

        return $this->fresh($record);
    }

    public function updateCertifications(UpdateStudentCertificationsRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, ['certifications.credential']);
        $items = collect($request->validated('certifications'));
        $existing = $record->certifications->keyBy('id');

        // Un id que no es de este alumno se rechaza junto a su campo, sin revelar si existe en otro.
        $unknown = $items->filter(fn (array $item): bool => isset($item['id']) && ! $existing->has($item['id']));
        if ($unknown->isNotEmpty()) {
            throw ValidationException::withMessages($unknown->mapWithKeys(fn (array $item, int $index): array => [
                "certifications.$index.id" => ['La certificación no existe.'],
            ])->all());
        }

        DB::transaction(function () use ($record, $items, $existing): void {
            $kept = $items->pluck('id')->filter()->all();
            // Las credenciales se borran en cascada con su certificación.
            StudentCertification::query()->where('student_id', $record->id)->whereNotIn('id', $kept)->delete();

            foreach ($items->values() as $position => $item) {
                $certification = isset($item['id']) ? $existing->get($item['id']) : new StudentCertification;
                $certification->student_id = $record->id;
                $certification->institution_id = $record->institution_id;
                $certification->name = CatalogSlug::displayName($item['name']);
                $certification->issuer = CatalogSlug::displayName($item['issuer']);
                $certification->issuer_slug = CatalogSlug::from($item['issuer']);
                $certification->issued_on = $item['issued_on'];
                $certification->expires_on = $item['expires_on'] ?? null;
                $certification->position = $position;

                $credentialId = $this->blankToNull($item['credential_id'] ?? null);
                $credentialUrl = $this->blankToNull($item['credential_url'] ?? null);
                $credentialChanged = $certification->exists && (
                    $certification->credential?->credential_id !== $credentialId
                    || $certification->credential?->credential_url !== $credentialUrl
                );

                // Editar lo revisado invalida la revisión de la institución (CA-04): debe volver a darse.
                if ($certification->isDirty(StudentCertification::REVIEWED_ATTRIBUTES) || $credentialChanged) {
                    $certification->verified_at = null;
                    $certification->verified_by = null;
                }
                $certification->save();

                $this->saveCredential($certification, $credentialId, $credentialUrl);
            }
        });

        return $this->fresh($record);
    }

    public function updateVerification(UpdateCertificationVerificationRequest $request, string $student, string $certification): JsonResponse
    {
        $record = $this->owned($request, $student, []);
        $target = StudentCertification::query()->where('student_id', $record->id)->find((int) $certification);
        abort_if($target === null, 404, 'La certificación no existe.');

        if (! $request->validated('verified')) {
            $target->verified_at = null;
            $target->verified_by = null;
        } elseif ($target->verified_at === null) {
            // Una revisión vigente conserva quién y cuándo la dio.
            $target->verified_at = now();
            $target->verified_by = $request->user()->id;
        }
        $target->save();

        return $this->fresh($record);
    }

    public function updateProjects(UpdateStudentProjectsRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, []);
        $projects = collect($request->validated('projects'));

        DB::transaction(function () use ($record, $projects): void {
            DB::table('student_projects')->where('student_id', $record->id)->delete();
            DB::table('student_projects')->insert($projects->map(fn (array $project, int $position): array => [
                'student_id' => $record->id,
                'institution_id' => $record->institution_id,
                'title' => CatalogSlug::displayName($project['title']),
                'description' => trim($project['description']),
                'role' => $this->blankToNull($project['role'] ?? null),
                'year' => $project['year'] ?? null,
                'position' => $position,
                'created_at' => now(),
                'updated_at' => now(),
            ])->all());
        });

        return $this->fresh($record);
    }

    public function updateLinks(UpdateStudentLinksRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, []);
        $links = collect($request->validated('links'));

        DB::transaction(function () use ($record, $links): void {
            DB::table('student_links')->where('student_id', $record->id)->delete();
            DB::table('student_links')->insert($links->map(fn (array $link, int $position): array => [
                'student_id' => $record->id,
                'institution_id' => $record->institution_id,
                'kind' => $link['kind'],
                'url' => $link['url'],
                'position' => $position,
                'created_at' => now(),
                'updated_at' => now(),
            ])->all());
        });

        return $this->fresh($record);
    }

    private function saveCredential(StudentCertification $certification, ?string $credentialId, ?string $credentialUrl): void
    {
        if ($credentialId === null && $credentialUrl === null) {
            $certification->credential()->delete();

            return;
        }

        $credential = $certification->credential ?? new StudentCertificationCredential;
        $credential->certification_id = $certification->id;
        $credential->student_id = $certification->student_id;
        $credential->institution_id = $certification->institution_id;
        $credential->credential_id = $credentialId;
        $credential->credential_url = $credentialUrl;
        $credential->verifiable = $credentialUrl !== null && $this->verifiableHost($credentialUrl);
        $credential->save();
    }

    private function verifiableHost(string $url): bool
    {
        $host = SafeHttpsUrl::host($url);

        return collect(config('cv.verifiable_credential_hosts'))->contains(fn (string $domain): bool => SafeHttpsUrl::belongsTo($host, $domain));
    }

    private function blankToNull(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }

    private function fresh(Student $student): JsonResponse
    {
        return $this->present($student->fresh(self::RELATIONS));
    }

    private function present(Student $student): JsonResponse
    {
        $certifications = $student->certifications;

        return response()->json(['data' => [
            // Lo que podrán ver y filtrar las empresas (sin identidad ni contacto).
            'public' => [
                'headline' => $student->headline,
                'skills' => $student->skills->map(fn (Skill $skill): array => [
                    'id' => $skill->id, 'name' => $skill->name, 'kind' => $skill->kind->value,
                ])->values(),
                'languages' => $student->languages->map(fn ($language): array => [
                    'language_code' => $language->language_code->value, 'level' => $language->level->value,
                ])->values(),
                'certifications' => $certifications->map(fn (StudentCertification $certification): array => [
                    'id' => $certification->id,
                    'name' => $certification->name,
                    'issuer' => $certification->issuer,
                    'issued_on' => $certification->issued_on->toDateString(),
                    'expires_on' => $certification->expires_on?->toDateString(),
                    'verified_at' => $certification->verified_at?->toISOString(),
                ])->values(),
                'projects' => $student->projects->map(fn ($project): array => [
                    'id' => $project->id, 'title' => $project->title, 'description' => $project->description,
                    'role' => $project->role, 'year' => $project->year,
                ])->values(),
            ],
            // Solo para la institución: revela la identidad del alumno (CA-02).
            'protected' => [
                'links' => $student->links->map(fn ($link): array => [
                    'id' => $link->id, 'kind' => $link->kind->value, 'url' => $link->url,
                ])->values(),
                'credentials' => $certifications->filter(fn (StudentCertification $certification): bool => $certification->credential !== null)
                    ->map(fn (StudentCertification $certification): array => [
                        'certification_id' => $certification->id,
                        'credential_id' => $certification->credential->credential_id,
                        'credential_url' => $certification->credential->credential_url,
                        'verifiable' => $certification->credential->verifiable,
                    ])->values(),
                'reviews' => $certifications->filter(fn (StudentCertification $certification): bool => $certification->verified_at !== null)
                    ->map(fn (StudentCertification $certification): array => [
                        'certification_id' => $certification->id,
                        'verified_by' => $certification->verifier?->name,
                    ])->values(),
            ],
        ]])->header('Cache-Control', 'no-store, private');
    }
}
