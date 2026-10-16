<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentCertification;
use App\Models\User;
use App\Support\ContactInformation;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create(['name' => 'Coordinación Dual']);
    $this->student = Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'A2026-001'])->create();
    $this->other = Institution::factory()->create();
    $this->foreign = Student::factory()->for($this->other)->withIdentity(['enrollment_number' => 'AJENO-1'])->create();
});

function cvUrl(Student|int $student, string $section = ''): string
{
    return '/api/students/'.($student instanceof Student ? $student->id : $student).'/cv'.($section === '' ? '' : '/'.$section);
}

function signInCvInstitution($test): void
{
    $test->loginWithCookies($test->account)->assertOk();
}

function certification(array $overrides = []): array
{
    return array_replace([
        'name' => 'CCNA: Introduction to Networks',
        'issuer' => 'Cisco',
        'issued_on' => '2025-06-15',
        'expires_on' => '2028-06-15',
        'credential_id' => 'CSCO-123',
        'credential_url' => 'https://www.credly.com/badges/abc-123',
    ], $overrides);
}

/** Una petición válida por sección: para recorrer las rutas en las pruebas de acceso. */
function cvSections(): array
{
    return [
        'headline' => ['headline', ['headline' => 'Desarrolladora Backend Junior']],
        'skills' => ['skills', ['skills' => [['name' => 'React', 'kind' => 'technical']]]],
        'languages' => ['languages', ['languages' => [['language_code' => 'en', 'level' => 4]]]],
        'certifications' => ['certifications', ['certifications' => [certification()]]],
        'projects' => ['projects', ['projects' => [['title' => 'Sistema de inventario', 'description' => 'API REST para el almacén escolar.']]]],
        'links' => ['links', ['links' => [['kind' => 'github', 'url' => 'https://github.com/alumna']]]],
    ];
}

describe('lectura y titular', function () {
    it('starts with an empty CV split into public and protected parts', function () {
        signInCvInstitution($this);
        $this->browserRequest('GET', cvUrl($this->student))
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => [
                'public' => ['headline' => null, 'skills' => [], 'languages' => [], 'certifications' => [], 'projects' => []],
                'protected' => ['links' => [], 'credentials' => [], 'reviews' => []],
            ]]);
    });

    it('saves the professional headline for any discipline (CA-01)', function (string $headline) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'headline'), ['headline' => "  $headline  "])
            ->assertOk()->assertJsonPath('data.public.headline', $headline);
        expect($this->student->fresh()->headline)->toBe($headline);
    })->with(['Desarrollador Backend Junior', 'Auxiliar Contable', 'Enfermera General', 'Técnico en Node.js y Vue.js']);

    it('clears the headline with null or an empty value', function (?string $empty) {
        $this->student->forceFill(['headline' => 'Anterior'])->save();
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'headline'), ['headline' => $empty])
            ->assertOk()->assertJsonPath('data.public.headline', null);
    })->with(['null' => [null], 'empty' => [''], 'spaces' => ['   ']]);

    it('validates the headline without writing it', function (array $payload, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'headline'), $payload)
            ->assertUnprocessable()->assertJsonValidationErrors(['headline' => $message]);
        expect($this->student->fresh()->headline)->toBeNull();
    })->with([
        'missing' => [[], 'Envía el titular profesional.'],
        'long' => [['headline' => str_repeat('a', 121)], 'El titular profesional no debe superar 120 caracteres.'],
        'number' => [['headline' => 5], 'El titular profesional no es válido.'],
        'contact' => [['headline' => 'Contáctame en ana@correo.mx'], ContactInformation::MESSAGE],
    ]);
});

describe('detector de datos de contacto (CA-02)', function () {
    it('detects URLs, emails, phones and domains', function (string $text) {
        expect(ContactInformation::present($text))->toBeTrue();
    })->with([
        'https' => ['Portafolio en https://ana.dev'],
        'http' => ['http://localhost:3000'],
        'www' => ['www.miportafolio'],
        'email' => ['ana.lopez@gmail.com'],
        'phone' => ['Llámame al 834 123 4567'],
        'phone with symbols' => ['(834) 123-4567'],
        'phone digits' => ['8341234567'],
        'domain com' => ['github.com/analopez'],
        'domain mx' => ['analopez.com.mx'],
        'domain io' => ['ana.io'],
        'domain dev' => ['Mira ana.dev'],
        'domain org' => ['wiki.org'],
        'uppercase' => ['GITHUB.COM/ANA'],
    ]);

    it('lets technology names and normal text through', function (string $text) {
        expect(ContactInformation::present($text))->toBeFalse();
    })->with([
        'node' => ['Node.js'], 'vue' => ['Vue.js y Next.js'], 'aspnet' => ['ASP.NET Core'], 'dotnet' => ['.NET 8'],
        'c sharp' => ['C# y C++'], 'version' => ['Python 3.12'], 'years' => ['Proyecto 2023-2024'],
        'iso' => ['ISO 9001:2015'], 'accents' => ['Atención al paciente en urgencias'], 'decimal' => ['Promedio 9.5'],
    ]);
});

describe('habilidades y catálogo', function () {
    it('saves technical and soft skills in order and adds them to the shared catalog (CA-01)', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => [
            ['name' => 'React', 'kind' => 'technical'],
            ['name' => '  Trabajo   en equipo ', 'kind' => 'soft'],
            ['name' => 'Curación de heridas', 'kind' => 'technical'],
        ]])->assertOk()
            ->assertJsonPath('data.public.skills.0.name', 'React')
            ->assertJsonPath('data.public.skills.1.name', 'Trabajo en equipo')
            ->assertJsonPath('data.public.skills.1.kind', 'soft')
            ->assertJsonPath('data.public.skills.2.name', 'Curación de heridas');

        expect(Skill::orderBy('slug')->pluck('slug')->all())->toBe(['curacion de heridas', 'react', 'trabajo en equipo']);
    });

    it('reuses the catalog by normalized slug and keeps the kind and name of the catalog', function () {
        $existing = Skill::query()->forceCreate(['name' => 'Liderazgo', 'slug' => 'liderazgo', 'kind' => 'soft']);
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => [['name' => 'LIDERAZGO', 'kind' => 'technical']]])
            ->assertOk()
            ->assertJsonPath('data.public.skills.0.id', $existing->id)
            ->assertJsonPath('data.public.skills.0.name', 'Liderazgo')
            ->assertJsonPath('data.public.skills.0.kind', 'soft');
        expect(Skill::count())->toBe(1);
    });

    it('keeps symbols in the slug so C#, C++ and C stay apart', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => [
            ['name' => 'C#', 'kind' => 'technical'], ['name' => 'C++', 'kind' => 'technical'], ['name' => 'C', 'kind' => 'technical'],
        ]])->assertOk()->assertJsonCount(3, 'data.public.skills');
        expect(Skill::pluck('slug')->sort()->values()->all())->toBe(['c', 'c#', 'c++']);
    });

    it('stores a repeated skill once, in its first position', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => [
            ['name' => 'Comunicación', 'kind' => 'soft'], ['name' => 'React', 'kind' => 'technical'], ['name' => 'comunicacion', 'kind' => 'soft'],
        ]])->assertOk()->assertJsonCount(2, 'data.public.skills')->assertJsonPath('data.public.skills.0.name', 'Comunicación');
    });

    it('replaces the previous skills and clears them with an empty list', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => [['name' => 'React', 'kind' => 'technical']]])->assertOk();
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => [['name' => 'Laravel', 'kind' => 'technical']]])
            ->assertOk()->assertJsonCount(1, 'data.public.skills')->assertJsonPath('data.public.skills.0.name', 'Laravel');
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), ['skills' => []])->assertOk()->assertJsonCount(0, 'data.public.skills');
        expect(DB::table('student_skills')->count())->toBe(0);
        expect(Skill::count())->toBe(2);
    });

    it('validates the skills without writing them', function (array $payload, string $field, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'skills'), $payload)
            ->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
        expect(Skill::count())->toBe(0);
    })->with([
        'missing' => [[], 'skills', 'Envía la lista de habilidades.'],
        'object' => [['skills' => ['a' => ['name' => 'React', 'kind' => 'technical']]], 'skills', 'La lista de habilidades no es válida.'],
        'too many' => [['skills' => array_map(fn ($i) => ['name' => "Habilidad $i", 'kind' => 'technical'], range(1, 31))], 'skills', 'Registra como máximo 30 habilidades.'],
        'no name' => [['skills' => [['kind' => 'technical']]], 'skills.0.name', 'Escribe el nombre de la habilidad.'],
        'long name' => [['skills' => [['name' => str_repeat('a', 81), 'kind' => 'technical']]], 'skills.0.name', 'El nombre de la habilidad no debe superar 80 caracteres.'],
        'contact' => [['skills' => [['name' => 'github.com/ana', 'kind' => 'technical']]], 'skills.0.name', ContactInformation::MESSAGE],
        'no kind' => [['skills' => [['name' => 'React']]], 'skills.0.kind', 'Indica si la habilidad es técnica o blanda.'],
        'bad kind' => [['skills' => [['name' => 'React', 'kind' => 'hard']]], 'skills.0.kind', 'El tipo de habilidad no es válido.'],
        'extra key' => [['skills' => [['name' => 'React', 'kind' => 'technical', 'id' => 5]]], 'skills.0', 'La habilidad no es válida.'],
    ]);

    it('autocompletes the catalog by literal prefix, up to ten results', function () {
        foreach (['React', 'React Native', 'Redux', 'Ruby', 'Recursos humanos'] as $name) {
            Skill::query()->forceCreate(['name' => $name, 'slug' => mb_strtolower($name), 'kind' => 'technical']);
        }
        foreach (range(1, 12) as $i) {
            Skill::query()->forceCreate(['name' => "Excel $i", 'slug' => sprintf('excel %02d', $i), 'kind' => 'technical']);
        }
        Skill::query()->forceCreate(['name' => '100% remoto', 'slug' => '100% remoto', 'kind' => 'soft']);
        signInCvInstitution($this);

        $this->browserRequest('GET', '/api/skills?q=REAC')->assertOk()
            ->assertExactJson(['data' => [
                ['id' => Skill::where('slug', 'react')->value('id'), 'name' => 'React', 'kind' => 'technical'],
                ['id' => Skill::where('slug', 'react native')->value('id'), 'name' => 'React Native', 'kind' => 'technical'],
            ]]);
        $this->browserRequest('GET', '/api/skills?q=excel')->assertOk()->assertJsonCount(10, 'data');
        $this->browserRequest('GET', '/api/skills?q='.urlencode('%'))->assertOk()->assertJsonCount(0, 'data');
        $this->browserRequest('GET', '/api/skills?q=100'.urlencode('%'))->assertOk()->assertJsonCount(1, 'data');
        $this->browserRequest('GET', '/api/skills?q=re'.urlencode('_'))->assertOk()->assertJsonCount(0, 'data');
        $this->browserRequest('GET', '/api/skills')->assertUnprocessable()->assertJsonValidationErrors('q');
    });

    it('only lets linked INSTITUTION accounts query the catalog', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', '/api/skills?q=re')->assertUnauthorized();
        foreach ([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY] as $role) {
            $this->initializeCookieBrowser();
            $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
            $this->browserRequest('GET', '/api/skills?q=re')->assertForbidden();
        }
    });
});

describe('idiomas', function () {
    it('saves languages with CEFR levels and Native as integers (CA-01, CA-03)', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'languages'), ['languages' => [
            ['language_code' => 'es', 'level' => 7], ['language_code' => 'en', 'level' => 4], ['language_code' => 'fr', 'level' => 1],
        ]])->assertOk()->assertJsonPath('data.public.languages', [
            ['language_code' => 'es', 'level' => 7], ['language_code' => 'en', 'level' => 4], ['language_code' => 'fr', 'level' => 1],
        ]);
        expect(DB::table('student_languages')->where('language_code', 'en')->value('level'))->toBe(4);
    });

    it('validates the languages without writing them', function (array $languages, string $field, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'languages'), ['languages' => $languages])
            ->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
        expect(DB::table('student_languages')->count())->toBe(0);
    })->with([
        'repeated' => [[['language_code' => 'en', 'level' => 3], ['language_code' => 'en', 'level' => 5]], 'languages.1.language_code', 'Este idioma ya está en la lista.'],
        'unknown' => [[['language_code' => 'xx', 'level' => 3]], 'languages.0.language_code', 'El idioma no es válido.'],
        'level zero' => [[['language_code' => 'en', 'level' => 0]], 'languages.0.level', 'El nivel no es válido.'],
        'level eight' => [[['language_code' => 'en', 'level' => 8]], 'languages.0.level', 'El nivel no es válido.'],
        'level text' => [[['language_code' => 'en', 'level' => 'B2']], 'languages.0.level', 'El nivel no es válido.'],
        'no level' => [[['language_code' => 'en']], 'languages.0.level', 'Selecciona el nivel.'],
        'too many' => [array_map(fn ($code) => ['language_code' => $code, 'level' => 3], ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ru', 'ar']), 'languages', 'Registra como máximo 10 idiomas.'],
    ]);
});

describe('certificaciones', function () {
    it('saves certifications with a protected credential and marks known platforms as verifiable (CA-04)', function () {
        signInCvInstitution($this);
        $response = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [
            certification(),
            certification(['name' => 'Soporte vital básico', 'issuer' => 'Cruz Roja Mexicana', 'expires_on' => null, 'credential_id' => 'CRM-77', 'credential_url' => null]),
            certification(['name' => 'Excel avanzado', 'issuer' => 'Microsoft', 'credential_id' => null, 'credential_url' => 'https://learn.microsoft.com/api/credentials/share/es-mx/ana/ABC']),
            certification(['name' => 'Primeros auxilios', 'issuer' => 'Escuela', 'credential_id' => null, 'credential_url' => 'https://escuela.edu.mx/certificados/1']),
        ]])->assertOk();

        $ids = $response->json('data.public.certifications.*.id');
        $response->assertJsonPath('data.public.certifications.0', [
            'id' => $ids[0], 'name' => 'CCNA: Introduction to Networks', 'issuer' => 'Cisco',
            'issued_on' => '2025-06-15', 'expires_on' => '2028-06-15', 'verified_at' => null,
        ])->assertJsonPath('data.public.certifications.1.expires_on', null)
            ->assertJsonPath('data.protected.credentials', [
                ['certification_id' => $ids[0], 'credential_id' => 'CSCO-123', 'credential_url' => 'https://www.credly.com/badges/abc-123', 'verifiable' => true],
                ['certification_id' => $ids[1], 'credential_id' => 'CRM-77', 'credential_url' => null, 'verifiable' => false],
                ['certification_id' => $ids[2], 'credential_id' => null, 'credential_url' => 'https://learn.microsoft.com/api/credentials/share/es-mx/ana/ABC', 'verifiable' => true],
                ['certification_id' => $ids[3], 'credential_id' => null, 'credential_url' => 'https://escuela.edu.mx/certificados/1', 'verifiable' => false],
            ]);
        expect($response->json('data.public.certifications.0'))->not->toHaveKeys(['credential_id', 'credential_url']);
        expect(StudentCertification::find($ids[0])->issuer_slug)->toBe('cisco');
    });

    it('updates by id, deletes the omitted ones with their credential and keeps the order', function () {
        signInCvInstitution($this);
        $ids = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [
            certification(['name' => 'Primera']), certification(['name' => 'Segunda']),
        ]])->json('data.public.certifications.*.id');

        $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [
            certification(['name' => 'Nueva', 'credential_id' => null, 'credential_url' => null]),
            certification(['id' => $ids[1], 'name' => 'Segunda']),
        ]])->assertOk()
            ->assertJsonPath('data.public.certifications.0.name', 'Nueva')
            ->assertJsonPath('data.public.certifications.1.id', $ids[1]);

        expect(StudentCertification::find($ids[0]))->toBeNull();
        expect(DB::table('student_certification_credentials')->pluck('certification_id')->all())->toBe([$ids[1]]);
    });

    it('rejects an id of another student without touching it', function () {
        signInCvInstitution($this);
        $own = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification()]])->json('data.public.certifications.0.id');
        $classmate = Student::factory()->for($this->institution)->withIdentity()->create();
        $theirs = $this->browserRequest('PUT', cvUrl($classmate, 'certifications'), ['certifications' => [certification(['name' => 'Ajena'])]])->json('data.public.certifications.0.id');

        $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [
            certification(['id' => $theirs, 'name' => 'Robada']),
        ]])->assertUnprocessable()->assertJsonValidationErrors(['certifications.0.id' => 'La certificación no existe.']);

        expect(StudentCertification::find($theirs)->name)->toBe('Ajena');
        expect(StudentCertification::find($own))->not->toBeNull();
    });

    it('validates the certifications without writing them', function (array $item, string $field, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification($item)]])
            ->assertUnprocessable()->assertJsonValidationErrors(["certifications.0.$field" => $message]);
        expect(StudentCertification::count())->toBe(0);
    })->with([
        'no name' => [['name' => null], 'name', 'Escribe el nombre de la certificación.'],
        'contact in name' => [['name' => 'Ver en www.credly'], 'name', ContactInformation::MESSAGE],
        'no issuer' => [['issuer' => ''], 'issuer', 'Escribe quién emitió la certificación.'],
        'future' => [['issued_on' => now()->addDay()->toDateString(), 'expires_on' => null], 'issued_on', 'La fecha de emisión no puede ser futura.'],
        'bad date' => [['issued_on' => '15/06/2025'], 'issued_on', 'La fecha de emisión no es válida.'],
        'expires before' => [['issued_on' => '2025-06-15', 'expires_on' => '2025-06-14'], 'expires_on', 'La vigencia no puede terminar antes de la fecha de emisión.'],
        'http url' => [['credential_url' => 'http://www.credly.com/badges/1'], 'credential_url', 'Escribe una dirección https:// pública y válida.'],
        'long credential id' => [['credential_id' => str_repeat('a', 121)], 'credential_id', 'El identificador de la credencial no debe superar 120 caracteres.'],
        'unknown id' => [['id' => 999999], 'id', 'La certificación no existe.'],
    ]);

    it('lets the institution mark a certification as reviewed and records who did it (CA-04)', function () {
        signInCvInstitution($this);
        $id = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification()]])->json('data.public.certifications.0.id');

        $response = $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$id/verification"), ['verified' => true])->assertOk();
        expect($response->json('data.public.certifications.0.verified_at'))->not->toBeNull();
        $response->assertJsonPath('data.protected.reviews', [['certification_id' => $id, 'verified_by' => 'Coordinación Dual']]);
        $record = StudentCertification::find($id);
        expect($record->verified_by)->toBe($this->account->id);

        // Volver a marcarla conserva la revisión original.
        $this->travel(5)->minutes();
        $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$id/verification"), ['verified' => true])->assertOk();
        expect(StudentCertification::find($id)->verified_at->equalTo($record->verified_at))->toBeTrue();

        $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$id/verification"), ['verified' => false])
            ->assertOk()->assertJsonPath('data.public.certifications.0.verified_at', null)->assertJsonPath('data.protected.reviews', []);
        expect(StudentCertification::find($id)->verified_by)->toBeNull();
    });

    it('clears the review when a reviewed certification is edited', function (array $change) {
        signInCvInstitution($this);
        $id = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification()]])->json('data.public.certifications.0.id');
        $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$id/verification"), ['verified' => true])->assertOk();

        $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification(['id' => $id, ...$change])]])
            ->assertOk()->assertJsonPath('data.public.certifications.0.verified_at', null);
        expect(StudentCertification::find($id)->only(['verified_at', 'verified_by']))->toBe(['verified_at' => null, 'verified_by' => null]);
    })->with([
        'name' => [['name' => 'CCNA 2']],
        'issuer' => [['issuer' => 'Cisco Networking Academy']],
        'issued on' => [['issued_on' => '2025-06-16']],
        'expires on' => [['expires_on' => null]],
        'credential id' => [['credential_id' => 'CSCO-999']],
        'credential url' => [['credential_url' => 'https://www.credly.com/badges/otra']],
        'credential removed' => [['credential_id' => null, 'credential_url' => null]],
    ]);

    it('keeps the review when a reviewed certification is saved unchanged or only moved', function () {
        signInCvInstitution($this);
        $id = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification()]])->json('data.public.certifications.0.id');
        $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$id/verification"), ['verified' => true])->assertOk();

        $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [
            certification(['name' => 'Otra', 'credential_id' => null, 'credential_url' => null]),
            certification(['id' => $id, 'name' => '  CCNA:   Introduction to Networks ']),
        ]])->assertOk();
        expect(StudentCertification::find($id)->verified_by)->toBe($this->account->id);
    });

    it('answers 404 to review a certification of another student, a foreign one or a missing one', function () {
        signInCvInstitution($this);
        $classmate = Student::factory()->for($this->institution)->withIdentity()->create();
        $theirs = $this->browserRequest('PUT', cvUrl($classmate, 'certifications'), ['certifications' => [certification()]])->json('data.public.certifications.0.id');

        $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$theirs/verification"), ['verified' => true])
            ->assertNotFound()->assertExactJson(['message' => 'La certificación no existe.']);
        $this->browserRequest('PATCH', cvUrl($this->foreign, "certifications/$theirs/verification"), ['verified' => true])
            ->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
        $this->browserRequest('PATCH', cvUrl($this->student, 'certifications/abc/verification'), ['verified' => true])->assertNotFound();
        expect(StudentCertification::find($theirs)->verified_at)->toBeNull();
    });

    it('validates the review flag strictly', function (mixed $value) {
        signInCvInstitution($this);
        $id = $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification()]])->json('data.public.certifications.0.id');
        $this->browserRequest('PATCH', cvUrl($this->student, "certifications/$id/verification"), ['verified' => $value])
            ->assertUnprocessable()->assertJsonValidationErrors('verified');
    })->with(['missing' => [null], 'string' => ['true'], 'integer' => [1]]);
});

describe('proyectos', function () {
    it('saves projects without links (CA-01)', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'projects'), ['projects' => [
            ['title' => 'Sistema de inventario', 'description' => 'API REST con Laravel y Vue.js.', 'role' => 'Backend', 'year' => 2025],
            ['title' => 'Campaña de vacunación', 'description' => 'Coordinación de brigadas comunitarias.', 'role' => null, 'year' => null],
        ]])->assertOk()
            ->assertJsonPath('data.public.projects.0.title', 'Sistema de inventario')
            ->assertJsonPath('data.public.projects.0.year', 2025)
            ->assertJsonPath('data.public.projects.1.role', null);
    });

    it('validates the projects without writing them', function (array $project, string $field, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'projects'), ['projects' => [array_replace(['title' => 'Proyecto', 'description' => 'Descripción.'], $project)]])
            ->assertUnprocessable()->assertJsonValidationErrors([rtrim("projects.0.$field", '.') => $message]);
        expect(DB::table('student_projects')->count())->toBe(0);
    })->with([
        'no title' => [['title' => ''], 'title', 'Escribe el nombre del proyecto.'],
        'no description' => [['description' => null], 'description', 'Describe el proyecto.'],
        'long description' => [['description' => str_repeat('a', 1001)], 'description', 'La descripción no debe superar 1000 caracteres.'],
        'url in description' => [['description' => 'Código en https://github.com/ana/inventario'], 'description', ContactInformation::MESSAGE],
        'email in role' => [['role' => 'ana@correo.com'], 'role', ContactInformation::MESSAGE],
        'phone in title' => [['title' => 'Llamar 8341234567'], 'title', ContactInformation::MESSAGE],
        'future year' => [['year' => now()->year + 1], 'year', 'El año debe estar entre 1950 y el año actual.'],
        'url field' => [['url' => 'https://github.com/ana'], '', 'El proyecto no es válido.'],
    ]);
});

describe('enlaces protegidos (CA-02)', function () {
    it('saves external links in the protected part', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'links'), ['links' => [
            ['kind' => 'github', 'url' => 'https://github.com/analopez'],
            ['kind' => 'linkedin', 'url' => 'https://mx.linkedin.com/in/analopez'],
            ['kind' => 'behance', 'url' => 'https://www.behance.net/analopez'],
            ['kind' => 'portfolio', 'url' => 'https://analopez.dev'],
        ]])->assertOk()
            ->assertJsonCount(4, 'data.protected.links')
            ->assertJsonPath('data.protected.links.1.url', 'https://mx.linkedin.com/in/analopez');
        $this->browserRequest('GET', cvUrl($this->student))->assertOk()->assertJsonCount(4, 'data.protected.links');
    });

    it('rejects unsafe URLs and hosts that do not match the kind', function (string $kind, string $url, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'links'), ['links' => [['kind' => $kind, 'url' => $url]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['links.0.url' => $message]);
        expect(DB::table('student_links')->count())->toBe(0);
    })->with([
        'http' => ['portfolio', 'http://ana.dev', 'Escribe una dirección https:// pública y válida.'],
        'javascript' => ['other', 'javascript:alert(1)', 'Escribe una dirección https:// pública y válida.'],
        'ipv4' => ['other', 'https://127.0.0.1/admin', 'Escribe una dirección https:// pública y válida.'],
        'ipv6' => ['other', 'https://[::1]/', 'Escribe una dirección https:// pública y válida.'],
        'private ip' => ['other', 'https://192.168.1.10', 'Escribe una dirección https:// pública y válida.'],
        'localhost' => ['other', 'https://localhost/x', 'Escribe una dirección https:// pública y válida.'],
        'internal' => ['other', 'https://api.internal/x', 'Escribe una dirección https:// pública y válida.'],
        'port' => ['other', 'https://ana.dev:8443', 'Escribe una dirección https:// pública y válida.'],
        'credentials' => ['other', 'https://user:pass@ana.dev', 'Escribe una dirección https:// pública y válida.'],
        'no tld' => ['other', 'https://intranet/', 'Escribe una dirección https:// pública y válida.'],
        'spaces' => ['other', 'https://ana.dev/mi portafolio', 'Escribe una dirección https:// pública y válida.'],
        'github elsewhere' => ['github', 'https://gitlab.com/ana', 'El enlace debe ser de github.com.'],
        'github lookalike' => ['github', 'https://github.com.evil.io/ana', 'El enlace debe ser de github.com.'],
        'github suffix' => ['github', 'https://notgithub.com/ana', 'El enlace debe ser de github.com.'],
        'linkedin elsewhere' => ['linkedin', 'https://ana.dev', 'El enlace debe ser de linkedin.com.'],
        'behance elsewhere' => ['behance', 'https://dribbble.com/ana', 'El enlace debe ser de behance.net.'],
    ]);

    it('rejects repeated links, unknown kinds and too many links', function (array $links, string $field, string $message) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'links'), ['links' => $links])
            ->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
    })->with([
        'repeated' => [[['kind' => 'portfolio', 'url' => 'https://ana.dev'], ['kind' => 'other', 'url' => 'https://ANA.dev']], 'links.1.url', 'Este enlace ya está en la lista.'],
        'kind' => [[['kind' => 'twitter', 'url' => 'https://x.com/ana']], 'links.0.kind', 'El tipo de enlace no es válido.'],
        'too many' => [array_map(fn ($i) => ['kind' => 'other', 'url' => "https://ana$i.dev"], range(1, 11)), 'links', 'Registra como máximo 10 enlaces.'],
    ]);

    it('never exposes the CV links or credentials in the roster or the student detail', function () {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, 'links'), ['links' => [['kind' => 'github', 'url' => 'https://github.com/secreta']]])->assertOk();
        $this->browserRequest('PUT', cvUrl($this->student, 'certifications'), ['certifications' => [certification(['credential_id' => 'CRED-SECRETA'])]])->assertOk();

        foreach (['/api/students', '/api/students/'.$this->student->id] as $url) {
            $content = $this->browserRequest('GET', $url)->assertOk()->getContent();
            expect($content)->not->toContain('github.com/secreta')->not->toContain('CRED-SECRETA')->not->toContain('credly');
        }
    });

    it('keeps the protected data out of the public CV tables', function () {
        $public = ['students', 'skills', 'student_skills', 'student_languages', 'student_certifications', 'student_projects'];
        foreach ($public as $table) {
            foreach (['url', 'credential_id', 'credential_url'] as $column) {
                expect(Schema::hasColumn($table, $column))->toBeFalse();
            }
        }
        foreach (['student_links', 'student_certification_credentials'] as $table) {
            expect(DB::selectOne('SELECT obj_description(?::regclass) AS comment', [$table])->comment)->toContain('Datos protegidos');
        }
    });
});

describe('aislamiento y acceso', function () {
    it('answers 404 for a student of another institution or a missing one in every section, without writing', function (string $section, array $payload) {
        signInCvInstitution($this);
        foreach ([$this->foreign->id, Student::max('id') + 100] as $id) {
            $this->browserRequest('GET', cvUrl($id))->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
            $this->browserRequest('PUT', cvUrl($id, $section), $payload)->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
        }
        expect($this->foreign->fresh()->headline)->toBeNull();
        foreach (['student_skills', 'student_languages', 'student_certifications', 'student_projects', 'student_links'] as $table) {
            expect(DB::table($table)->count())->toBe(0);
        }
    })->with(cvSections());

    it('answers 404 for malformed identifiers', function (string $id) {
        signInCvInstitution($this);
        $this->browserRequest('GET', '/api/students/'.$id.'/cv')->assertNotFound();
        $this->browserRequest('PUT', '/api/students/'.$id.'/cv/headline', ['headline' => 'X'])->assertNotFound();
    })->with(['zero' => ['0'], 'text' => ['abc'], 'overflow' => ['99999999999999999999'], 'leading zero' => ['01']]);

    it('only lets INSTITUTION accounts read or change a CV', function (UserRole $role) {
        $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
        $this->browserRequest('GET', cvUrl($this->student))->assertForbidden();
        foreach (cvSections() as [$section, $payload]) {
            $this->browserRequest('PUT', cvUrl($this->student, $section), $payload)->assertForbidden();
        }
        expect(DB::table('student_links')->count())->toBe(0);
    })->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

    it('rejects anonymous requests, accounts without institution and inactive institutions', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', cvUrl($this->student))->assertUnauthorized();
        $this->browserRequest('PUT', cvUrl($this->student, 'headline'), ['headline' => 'X'])->assertUnauthorized();

        $this->loginWithCookies(User::factory()->role(UserRole::INSTITUTION)->create(['institution_id' => null]))->assertOk();
        $this->browserRequest('GET', cvUrl($this->student))->assertForbidden();

        $this->initializeCookieBrowser();
        signInCvInstitution($this);
        $this->institution->forceFill(['is_active' => false])->save();
        $this->browserRequest('PUT', cvUrl($this->student, 'headline'), ['headline' => 'X'])->assertUnauthorized();
        expect($this->student->fresh()->headline)->toBeNull();
    });

    it('requires CSRF to change a CV', function (string $section, array $payload) {
        signInCvInstitution($this);
        $this->browserRequest('PUT', cvUrl($this->student, $section), $payload, csrf: false)->assertStatus(419);
    })->with(cvSections());
});

describe('base de datos y búsqueda (CA-03)', function () {
    it('keeps every CV row in the institution of its student', function (string $table, array $row) {
        $row = array_map(fn ($value) => $value instanceof Closure ? $value() : $value, $row);
        expect(fn () => DB::table($table)->insert(array_replace([
            'student_id' => $this->foreign->id, 'institution_id' => $this->institution->id,
        ], $row)))->toThrow(QueryException::class);
    })->with([
        'skills' => ['student_skills', ['skill_id' => fn () => Skill::query()->forceCreate(['name' => 'X', 'slug' => 'x', 'kind' => 'soft'])->id, 'position' => 0]],
        'languages' => ['student_languages', ['language_code' => 'en', 'level' => 4, 'position' => 0]],
        'certifications' => ['student_certifications', ['name' => 'X', 'issuer' => 'X', 'issuer_slug' => 'x', 'issued_on' => '2025-01-01', 'position' => 0]],
        'projects' => ['student_projects', ['title' => 'X', 'description' => 'X', 'position' => 0]],
        'links' => ['student_links', ['kind' => 'other', 'url' => 'https://x.dev', 'position' => 0]],
    ]);

    it('enforces the CV rules in the database', function (string $table, array $row) {
        $base = ['student_id' => $this->student->id, 'institution_id' => $this->institution->id, 'position' => 0];
        $row = array_map(fn ($value) => $value instanceof Closure ? $value() : $value, $row);
        expect(fn () => DB::table($table)->insert(array_replace($base, $row)))->toThrow(QueryException::class);
    })->with([
        'level above native' => ['student_languages', ['language_code' => 'en', 'level' => 8]],
        'uppercase language' => ['student_languages', ['language_code' => 'EN', 'level' => 4]],
        'expires before issued' => ['student_certifications', ['name' => 'X', 'issuer' => 'X', 'issuer_slug' => 'x', 'issued_on' => '2025-02-01', 'expires_on' => '2025-01-01']],
        'reviewer without date' => ['student_certifications', ['name' => 'X', 'issuer' => 'X', 'issuer_slug' => 'x', 'issued_on' => '2025-01-01', 'verified_by' => fn () => User::factory()->create()->id]],
        'unknown link kind' => ['student_links', ['kind' => 'twitter', 'url' => 'https://x.com/a']],
    ]);

    it('has indexes that start with the filtered column', function () {
        $indexes = collect(DB::select("SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('skills', 'student_skills', 'student_languages', 'student_certifications')"))
            ->pluck('indexdef', 'indexname');
        expect($indexes->first(fn ($def) => str_contains($def, 'student_skills') && str_contains($def, '(skill_id, student_id)')))->not->toBeNull();
        expect($indexes->first(fn ($def) => str_contains($def, '(language_code, level, student_id)')))->not->toBeNull();
        expect($indexes->first(fn ($def) => str_contains($def, '(issuer_slug, student_id)')))->not->toBeNull();
        expect($indexes['skills_slug_prefix_index'])->toContain('text_pattern_ops');
    });

    it('answers a cross filter like «English B2 or higher, React and a Cisco certification»', function () {
        signInCvInstitution($this);
        $profile = function (array $languages, array $skills, array $issuers): Student {
            $student = Student::factory()->for($this->institution)->withIdentity()->create();
            $this->browserRequest('PUT', cvUrl($student, 'languages'), ['languages' => array_map(fn ($code, $level) => ['language_code' => $code, 'level' => $level], array_keys($languages), $languages)])->assertOk();
            $this->browserRequest('PUT', cvUrl($student, 'skills'), ['skills' => array_map(fn ($name) => ['name' => $name, 'kind' => 'technical'], $skills)])->assertOk();
            $this->browserRequest('PUT', cvUrl($student, 'certifications'), ['certifications' => array_map(fn ($issuer) => certification(['issuer' => $issuer, 'credential_id' => null, 'credential_url' => null]), $issuers)])->assertOk();

            return $student;
        };

        $b2 = $profile(['en' => 4], ['React', 'Laravel'], ['Cisco']);
        $native = $profile(['en' => 7, 'es' => 7], ['react'], ['CISCO']);
        $b1 = $profile(['en' => 3], ['React'], ['Cisco']);
        $noReact = $profile(['en' => 5], ['Vue.js'], ['Cisco']);
        $noCisco = $profile(['en' => 6], ['React'], ['Microsoft']);
        $french = $profile(['fr' => 6], ['React'], ['Cisco']);

        // Lo que hará el futuro buscador de las empresas: un EXISTS por filtro, cada uno con su índice.
        $matches = Student::query()
            ->whereExists(fn ($query) => $query->from('student_languages')->whereColumn('student_languages.student_id', 'students.id')
                ->where('language_code', 'en')->where('level', '>=', 4))
            ->whereExists(fn ($query) => $query->from('student_skills')->join('skills', 'skills.id', '=', 'student_skills.skill_id')
                ->whereColumn('student_skills.student_id', 'students.id')->where('skills.slug', 'react'))
            ->whereExists(fn ($query) => $query->from('student_certifications')->whereColumn('student_certifications.student_id', 'students.id')
                ->where('issuer_slug', 'cisco'))
            ->orderBy('id')
            ->pluck('id')
            ->all();

        expect($matches)->toBe([$b2->id, $native->id]);
        expect($matches)->not->toContain($b1->id, $noReact->id, $noCisco->id, $french->id);
    });
});
