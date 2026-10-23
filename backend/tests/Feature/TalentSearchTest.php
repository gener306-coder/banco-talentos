<?php

use App\Enums\UserRole;
use App\Http\Controllers\TalentController;
use App\Models\Company;
use App\Models\Institution;
use App\Models\Student;
use App\Models\User;
use App\Support\CatalogSlug;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S4-05: buscador de talento anónimo (vista exploratoria).
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    // La empresa está en Reynosa: es el origen por defecto del radio.
    $this->company = Company::factory()->create(['state_code' => '28', 'municipality_code' => '28032']);
    $this->companyUser = User::factory()->forCompany($this->company)->create();
    $this->institution = Institution::factory()->create(['name' => 'Universidad Tecnológica del Golfo']);
});

/**
 * Alumno buscable de la institución con expediente público completo, ubicado en la cabecera de su municipio
 * como lo deja HU-S4-04, y CV opcional (habilidades, idiomas, certificaciones y proyectos).
 */
function talent(Institution $institution, array $profile = [], array $cv = []): Student
{
    $student = Student::factory()->for($institution)->withIdentity([
        'enrollment_number' => 'MAT-'.strtoupper(bin2hex(random_bytes(3))), 'given_names' => 'Nombre Secreto', 'first_surname' => 'Apellido Secreto',
    ])->create();
    $values = array_replace([
        'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 6, 'dual_available' => true,
        'state_code' => '28', 'municipality_code' => '28032', 'can_relocate' => false, 'headline' => 'Técnico en automatización',
    ], $profile);
    DB::table('students')->where('id', $student->id)->update($values);
    DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code', [$student->id]);

    foreach ($cv['skills'] ?? [] as $position => [$name, $kind]) {
        $slug = CatalogSlug::from($name);
        DB::table('skills')->insertOrIgnore(['name' => $name, 'slug' => $slug, 'kind' => $kind, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('student_skills')->insert(['student_id' => $student->id, 'institution_id' => $institution->id,
            'skill_id' => DB::table('skills')->where('slug', $slug)->value('id'), 'position' => $position]);
    }
    foreach ($cv['languages'] ?? [] as $position => [$code, $level]) {
        DB::table('student_languages')->insert(['student_id' => $student->id, 'institution_id' => $institution->id,
            'language_code' => $code, 'level' => $level, 'position' => $position]);
    }
    foreach ($cv['certifications'] ?? [] as $position => [$name, $verified]) {
        $certification = DB::table('student_certifications')->insertGetId(['student_id' => $student->id, 'institution_id' => $institution->id,
            'name' => $name, 'issuer' => 'Cisco', 'issuer_slug' => 'cisco', 'issued_on' => '2025-06-01', 'position' => $position,
            'verified_at' => $verified ? now() : null, 'verified_by' => $verified ? User::factory()->forInstitution($institution)->create(['name' => 'Revisora Secreta'])->id : null,
            'created_at' => now(), 'updated_at' => now()]);
        DB::table('student_certification_credentials')->insert(['certification_id' => $certification, 'student_id' => $student->id,
            'institution_id' => $institution->id, 'credential_id' => 'CRED-SECRETA-'.$position, 'credential_url' => 'https://www.credly.com/badges/secreta-'.$position,
            'verifiable' => true, 'created_at' => now(), 'updated_at' => now()]);
    }
    foreach ($cv['projects'] ?? [] as $position => $title) {
        DB::table('student_projects')->insert(['student_id' => $student->id, 'institution_id' => $institution->id,
            'title' => $title, 'description' => 'Descripción del proyecto', 'role' => 'Desarrollo', 'year' => 2025, 'position' => $position,
            'created_at' => now(), 'updated_at' => now()]);
    }
    foreach ($cv['links'] ?? [] as $position => $url) {
        DB::table('student_links')->insert(['student_id' => $student->id, 'institution_id' => $institution->id,
            'kind' => 'github', 'url' => $url, 'position' => $position, 'created_at' => now(), 'updated_at' => now()]);
    }

    return $student->fresh();
}

function searchTalent($test, array $query = [])
{
    return $test->browserRequest('GET', '/api/talent'.($query ? '?'.http_build_query($query) : ''));
}

/** Titulares de los resultados, en orden. */
function headlines($response): array
{
    return array_column($response->assertOk()->json('data'), 'headline');
}

it('only lets COMPANY accounts search talent (CA-01)', function (UserRole $role) {
    talent($this->institution);
    $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution($this->institution)->create() : User::factory()->role($role)->create();
    $this->loginWithCookies($user)->assertOk();

    searchTalent($this)->assertForbidden();
})->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::SECRETARY]);

it('rejects visitors and the accounts of an inactive company (CA-01)', function () {
    searchTalent($this)->assertUnauthorized();

    $this->loginWithCookies($this->companyUser)->assertOk();
    $this->company->forceFill(['is_active' => false])->save();
    searchTalent($this)->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
});

it('shows only active students of active institutions with a captured profile (CA-02)', function () {
    talent($this->institution, ['headline' => 'Visible']);
    talent($this->institution, ['headline' => 'Inactivo', 'is_active' => false]);
    talent(Institution::factory()->inactive()->create(), ['headline' => 'De institución inactiva']);
    talent($this->institution, ['headline' => 'Sin carrera', 'program' => null]);
    talent($this->institution, ['headline' => 'Sin estado', 'state_code' => null, 'municipality_code' => null]);
    Student::factory()->for($this->institution)->withIdentity()->create();
    $this->loginWithCookies($this->companyUser)->assertOk();

    $response = searchTalent($this)->assertHeader('Cache-Control', 'no-store, private');
    expect(headlines($response))->toBe(['Visible']);
    expect($response->json('meta'))->toBe(['current_page' => 1, 'last_page' => 1, 'total' => 1, 'per_page' => 20]);
});

it('builds the anonymous card with the explicit list of public fields (CA-05)', function () {
    talent($this->institution, ['municipality_code' => '28022', 'headline' => 'Analista de datos'], [
        'skills' => [['Python', 'technical'], ['SQL', 'technical'], ['Excel', 'technical'], ['Power BI', 'technical'], ['Pandas', 'technical'], ['Git', 'technical'], ['Trabajo en equipo', 'soft']],
        'languages' => [['en', 4], ['fr', 2]],
        'certifications' => [['CCNA', true], ['Scrum', false], ['ITIL', true]],
    ]);
    $this->loginWithCookies($this->companyUser)->assertOk();

    $card = searchTalent($this)->assertOk()->json('data.0');

    expect(array_keys($card))->toBe([
        'public_id', 'headline', 'program', 'period_type', 'period_number', 'institution', 'state_code', 'municipality',
        'distance_km', 'skills', 'languages', 'verified_certifications', 'dual_available', 'can_relocate',
    ]);
    expect($card)->toMatchArray([
        'headline' => 'Analista de datos', 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 6,
        'institution' => 'Universidad Tecnológica del Golfo', 'state_code' => '28', 'municipality' => 'Matamoros',
        // Reynosa–Matamoros: unos 81 km entre cabeceras, redondeado a múltiplos de 5.
        'distance_km' => 80, 'verified_certifications' => 2, 'dual_available' => true, 'can_relocate' => false,
        'languages' => [['language_code' => 'en', 'level' => 4], ['language_code' => 'fr', 'level' => 2]],
    ]);
    expect($card['skills'])->toHaveCount(6)->and($card['skills'][0])->toBe(['name' => 'Python', 'kind' => 'technical']);
    expect($card['public_id'])->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/');
});

it('never returns identity, social security, links, credentials, reviewers, location or internal ids (CA-07)', function () {
    $student = talent($this->institution, [], [
        'skills' => [['React', 'technical']],
        'certifications' => [['CCNA', true]],
        'projects' => ['Robot seguidor de línea'],
        'links' => ['https://github.com/alumno-secreto'],
    ]);
    DB::table('student_social_security')->insert(['student_id' => $student->id, 'institution_id' => $this->institution->id,
        'nss' => encrypt('12345678903'), 'nss_hash' => hash('sha256', 'x'), 'created_at' => now(), 'updated_at' => now()]);
    $identity = $student->identity;
    $this->loginWithCookies($this->companyUser)->assertOk();

    foreach ([searchTalent($this), $this->browserRequest('GET', '/api/talent/'.$student->public_id)] as $response) {
        $content = $response->assertOk()->getContent();
        expect($content)->not->toContain($identity->enrollment_number)
            ->not->toContain('Nombre Secreto')->not->toContain('Apellido Secreto')
            ->not->toContain('12345678903')
            ->not->toContain('alumno-secreto')
            ->not->toContain('CRED-SECRETA')->not->toContain('credly.com')
            ->not->toContain('Revisora Secreta')
            ->not->toContain('"id"')->not->toContain('"location"')->not->toContain('student_id')->not->toContain('verified_by');
    }
});

it('combines skill filters with AND, ignoring case and accents (CA-03)', function () {
    talent($this->institution, ['headline' => 'Ambas'], ['skills' => [['React', 'technical'], ['Diseño UX', 'technical']]]);
    talent($this->institution, ['headline' => 'Solo React'], ['skills' => [['React', 'technical']]]);
    $this->loginWithCookies($this->companyUser)->assertOk();

    expect(headlines(searchTalent($this, ['skills' => ['react']])))->toEqualCanonicalizing(['Ambas', 'Solo React']);
    expect(headlines(searchTalent($this, ['skills' => ['REACT', 'diseno ux']])))->toBe(['Ambas']);
    expect(headlines(searchTalent($this, ['skills' => ['React', 'Cobol']])))->toBe([]);
});

it('filters by language with a minimum level (CA-03)', function () {
    talent($this->institution, ['headline' => 'B2'], ['languages' => [['en', 4]]]);
    talent($this->institution, ['headline' => 'A2'], ['languages' => [['en', 2]]]);
    talent($this->institution, ['headline' => 'Nativo francés'], ['languages' => [['fr', 7]]]);
    $this->loginWithCookies($this->companyUser)->assertOk();

    expect(headlines(searchTalent($this, ['language' => 'en', 'min_level' => 4])))->toBe(['B2']);
    expect(headlines(searchTalent($this, ['language' => 'en', 'min_level' => 1])))->toEqualCanonicalizing(['B2', 'A2']);
    expect(headlines(searchTalent($this, ['language' => 'fr', 'min_level' => 7])))->toBe(['Nativo francés']);
});

it('filters by program text, minimum period, availability and verified certification (CA-03)', function () {
    talent($this->institution, ['headline' => 'Mecatrónica 8', 'period_number' => 8, 'can_relocate' => true], ['certifications' => [['CCNA', true]]]);
    talent($this->institution, ['headline' => 'Contabilidad 4', 'program' => 'Contaduría 100% en línea', 'period_number' => 4, 'dual_available' => false], ['certifications' => [['NIF', false]]]);
    $this->loginWithCookies($this->companyUser)->assertOk();

    expect(headlines(searchTalent($this, ['program' => 'MECATR'])))->toBe(['Mecatrónica 8']);
    expect(headlines(searchTalent($this, ['program' => '100%'])))->toBe(['Contabilidad 4']);
    expect(headlines(searchTalent($this, ['program' => '_'])))->toBe([]);
    expect(headlines(searchTalent($this, ['min_period' => 5])))->toBe(['Mecatrónica 8']);
    expect(headlines(searchTalent($this, ['dual_available' => 0])))->toBe(['Contabilidad 4']);
    expect(headlines(searchTalent($this, ['can_relocate' => 1])))->toBe(['Mecatrónica 8']);
    expect(headlines(searchTalent($this, ['verified_certification' => 1])))->toBe(['Mecatrónica 8']);
    expect(headlines(searchTalent($this, ['verified_certification' => 0])))->toEqualCanonicalizing(['Mecatrónica 8', 'Contabilidad 4']);
});

it('filters by state (CA-03)', function () {
    talent($this->institution, ['headline' => 'Tamaulipas']);
    talent($this->institution, ['headline' => 'Nuevo León', 'state_code' => '19', 'municipality_code' => '19039']);
    $this->loginWithCookies($this->companyUser)->assertOk();

    expect(headlines(searchTalent($this, ['state_code' => '19'])))->toBe(['Nuevo León']);
});

it('measures the radius from the company municipality by default, ordered by distance (CA-03, CA-04, CA-09)', function () {
    talent($this->institution, ['headline' => 'Victoria', 'municipality_code' => '28041']);
    talent($this->institution, ['headline' => 'Monterrey', 'state_code' => '19', 'municipality_code' => '19039']);
    talent($this->institution, ['headline' => 'Matamoros', 'municipality_code' => '28022']);
    talent($this->institution, ['headline' => 'Reynosa', 'municipality_code' => '28032']);
    $this->loginWithCookies($this->companyUser)->assertOk();

    expect(headlines(searchTalent($this)))->toBe(['Reynosa', 'Matamoros', 'Monterrey', 'Victoria']);
    expect(array_column(searchTalent($this)->json('data'), 'distance_km'))->toBe([0, 80, 210, 275]);
    expect(headlines(searchTalent($this, ['radius_km' => 25])))->toBe(['Reynosa']);
    expect(headlines(searchTalent($this, ['radius_km' => 100])))->toBe(['Reynosa', 'Matamoros']);
    expect(headlines(searchTalent($this, ['radius_km' => 200])))->toBe(['Reynosa', 'Matamoros']);
});

it('lets the company choose another municipality as origin and ignores client coordinates (CA-04)', function () {
    talent($this->institution, ['headline' => 'Victoria', 'municipality_code' => '28041']);
    talent($this->institution, ['headline' => 'Reynosa', 'municipality_code' => '28032']);
    $this->loginWithCookies($this->companyUser)->assertOk();

    $fromVictoria = searchTalent($this, ['origin_municipality_code' => '28041']);
    expect(headlines($fromVictoria))->toBe(['Victoria', 'Reynosa']);
    expect(headlines(searchTalent($this, ['origin_municipality_code' => '28041', 'radius_km' => 10])))->toBe(['Victoria']);

    // Coordenadas enviadas por el cliente: se descartan y el origen sigue siendo el municipio de la empresa.
    expect(headlines(searchTalent($this, ['latitude' => 23.73, 'longitude' => -99.15, 'radius_km' => 10])))->toBe(['Reynosa']);
});

it('rounds distances to multiples of 5 km (CA-04)', function (float $meters, int $km) {
    expect(TalentController::roundedDistance($meters))->toBe($km);
})->with([[0, 0], [2_400, 0], [2_600, 5], [80_800, 80], [208_800, 210], [276_900, 275]]);

it('orders equal distances by the most recent update (CA-09)', function () {
    $older = talent($this->institution, ['headline' => 'Anterior']);
    $newer = talent($this->institution, ['headline' => 'Reciente']);
    DB::table('students')->where('id', $older->id)->update(['updated_at' => now()->subDay()]);
    DB::table('students')->where('id', $newer->id)->update(['updated_at' => now()]);
    $this->loginWithCookies($this->companyUser)->assertOk();

    expect(headlines(searchTalent($this)))->toBe(['Reciente', 'Anterior']);
});

it('paginates the results in pages of 20 (CA-09)', function () {
    foreach (range(1, 21) as $number) {
        talent($this->institution, ['headline' => 'Perfil '.$number]);
    }
    $this->loginWithCookies($this->companyUser)->assertOk();

    searchTalent($this)->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.last_page', 2)->assertJsonPath('meta.total', 21);
    searchTalent($this, ['page' => 2])->assertOk()->assertJsonCount(1, 'data');
});

it('limits the request rate per account (CA-09)', function () {
    $this->loginWithCookies($this->companyUser)->assertOk();

    foreach (range(1, 60) as $attempt) {
        searchTalent($this)->assertOk();
    }
    searchTalent($this)->assertStatus(429);
});

it('validates the filters', function (array $query, string $field) {
    $this->loginWithCookies($this->companyUser)->assertOk();

    searchTalent($this, $query)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'radius outside the list' => [['radius_km' => 30], 'radius_km'],
    'unknown language' => [['language' => 'xx', 'min_level' => 3], 'language'],
    'language without level' => [['language' => 'en'], 'min_level'],
    'level out of range' => [['language' => 'en', 'min_level' => 8], 'min_level'],
    'period out of range' => [['min_period' => 16], 'min_period'],
    'unknown state' => [['state_code' => '33'], 'state_code'],
    'unknown origin' => [['origin_municipality_code' => '28999'], 'origin_municipality_code'],
    'origin as coordinates' => [['origin_municipality_code' => '23.7,-99.1'], 'origin_municipality_code'],
    'too many skills' => [['skills' => array_map(fn ($n) => 'Habilidad '.$n, range(1, 11))], 'skills'],
    'non boolean flag' => [['dual_available' => 'quizá'], 'dual_available'],
]);

it('shows the full public profile by its public identifier, without actions (CA-06)', function () {
    $student = talent($this->institution, ['headline' => 'Perfil completo'], [
        'skills' => array_map(fn ($n) => ['Habilidad '.$n, 'technical'], range(1, 8)),
        'certifications' => [['CCNA', true], ['Scrum', false]],
        'projects' => ['Robot seguidor de línea'],
    ]);
    $this->loginWithCookies($this->companyUser)->assertOk();

    $profile = $this->browserRequest('GET', '/api/talent/'.$student->public_id)
        ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data');

    expect($profile['headline'])->toBe('Perfil completo')
        ->and($profile['institution'])->toBe('Universidad Tecnológica del Golfo')
        ->and($profile['skills'])->toHaveCount(8)
        ->and($profile['certifications'])->toBe([
            ['name' => 'CCNA', 'issuer' => 'Cisco', 'issued_on' => '2025-06-01', 'expires_on' => null, 'verified' => true],
            ['name' => 'Scrum', 'issuer' => 'Cisco', 'issued_on' => '2025-06-01', 'expires_on' => null, 'verified' => false],
        ])
        ->and($profile['projects'])->toBe([['title' => 'Robot seguidor de línea', 'description' => 'Descripción del proyecto', 'role' => 'Desarrollo', 'year' => 2025]]);
});

it('answers the same 404 for unknown, inactive, foreign-institution-inactive or incomplete profiles (CA-08)', function (Closure $make) {
    $this->loginWithCookies($this->companyUser)->assertOk();
    $publicId = $make($this->institution);

    $this->browserRequest('GET', '/api/talent/'.$publicId)->assertNotFound()->assertJsonPath('message', 'El perfil no existe.');
})->with([
    'unknown' => [fn () => '3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'],
    'inactive student' => [fn (Institution $institution) => talent($institution, ['is_active' => false])->public_id],
    'inactive institution' => [fn () => talent(Institution::factory()->inactive()->create())->public_id],
    'incomplete profile' => [fn (Institution $institution) => Student::factory()->for($institution)->withIdentity()->create()->fresh()->public_id],
]);

it('never accepts the internal student id or malformed identifiers (CA-08)', function () {
    $student = talent($this->institution);
    $this->loginWithCookies($this->companyUser)->assertOk();

    $this->browserRequest('GET', '/api/talent/'.$student->id)->assertNotFound();
    $this->browserRequest('GET', '/api/talent/not-a-uuid')->assertNotFound();
    $this->browserRequest('GET', '/api/talent/'.strtoupper($student->public_id))->assertNotFound();
});

it('gives every student a unique random UUID', function () {
    $first = talent($this->institution);
    $second = talent($this->institution);

    expect($first->public_id)->not->toBe($second->public_id);
    expect(fn () => DB::table('students')->where('id', $second->id)->update(['public_id' => $first->public_id]))
        ->toThrow(QueryException::class);
});
