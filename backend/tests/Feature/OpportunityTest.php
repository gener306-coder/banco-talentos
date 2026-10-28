<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\Opportunity;
use App\Models\Skill;
use App\Models\User;
use App\Support\ContactInformation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// HU-S5-02: oportunidades de Educación Dual de la empresa.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    // La empresa está en Reynosa (Tamaulipas).
    $this->company = Company::factory()->create(['state_code' => '28', 'municipality_code' => '28032']);
    $this->account = User::factory()->forCompany($this->company)->create(['name' => 'Reclutadora Titular']);
});

function opportunityPayload(array $overrides = []): array
{
    return array_replace([
        'title' => 'Automatización de línea de ensamble',
        'program' => 'Ingeniería Mecatrónica',
        'period_type' => 'semester',
        'period_number' => 5,
        'vacancies' => 3,
        'can_relocate' => false,
        'state_code' => '28',
        'municipality_code' => '28032',
        'description' => 'Apoyo en la programación de PLC y en el mantenimiento preventivo de la línea.',
        'skills' => [['name' => 'PLC', 'kind' => 'technical'], ['name' => 'Trabajo en equipo', 'kind' => 'soft']],
        'language_code' => 'en',
        'min_level' => 4,
    ], $overrides);
}

/** Oportunidad guardada directamente, con el punto de la cabecera como lo deja la API. */
function opportunityFor(Company $company, array $attributes = []): Opportunity
{
    $opportunity = new Opportunity(array_replace(array_diff_key(opportunityPayload(), ['skills' => true]), $attributes));
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '{$opportunity->municipality_code}')");
    if (array_key_exists('is_active', $attributes)) {
        $opportunity->is_active = $attributes['is_active'];
    }
    $opportunity->save();

    return $opportunity->refresh();
}

function signInCompany($test): void
{
    $test->loginWithCookies($test->account)->assertOk();
}

describe('acceso (CA-01)', function () {
    it('rejects visitors', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', '/api/opportunities')->assertUnauthorized();
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload())->assertUnauthorized();
    });

    it('forbids every other role', function (UserRole $role) {
        $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution(Institution::factory()->create())->create() : User::factory()->role($role)->create();
        $opportunity = opportunityFor($this->company);
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('GET', '/api/opportunities')->assertForbidden();
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload())->assertForbidden();
        $this->browserRequest('GET', '/api/opportunities/'.$opportunity->id)->assertForbidden();
        $this->browserRequest('PUT', '/api/opportunities/'.$opportunity->id, opportunityPayload())->assertForbidden();
        expect(Opportunity::query()->count())->toBe(1);
    })->with([UserRole::ADMIN, UserRole::INSTITUTION, UserRole::SECRETARY]);

    it('rejects the accounts of an inactive company with COMPANY_INACTIVE', function () {
        signInCompany($this);
        $this->company->forceFill(['is_active' => false])->save();

        $this->browserRequest('GET', '/api/opportunities')->assertUnauthorized()->assertJsonPath('code', 'COMPANY_INACTIVE');
    });

    it('forbids a COMPANY account without a company', function () {
        signInCompany($this);
        // Solo posible en una base local anterior a HU-S4-03 (restricción NOT VALID).
        DB::statement('ALTER TABLE users DROP CONSTRAINT users_role_organization');
        DB::table('users')->where('id', $this->account->id)->update(['company_id' => null]);

        $this->browserRequest('GET', '/api/opportunities')->assertForbidden();
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload())->assertForbidden();
        $this->browserRequest('GET', '/api/skills?q=pl')->assertForbidden();
    });

    it('lets COMPANY accounts autocomplete the shared skills catalog', function () {
        Skill::query()->forceCreate(['name' => 'PLC', 'slug' => 'plc', 'kind' => 'technical']);
        signInCompany($this);

        $this->browserRequest('GET', '/api/skills?q=pl')->assertOk()->assertJsonPath('data.0.name', 'PLC');
    });

    it('has no DELETE route and sends no-store on every response', function () {
        $opportunity = opportunityFor($this->company);
        signInCompany($this);

        $this->browserRequest('DELETE', '/api/opportunities/'.$opportunity->id)->assertStatus(405);
        $this->browserRequest('GET', '/api/opportunities')->assertHeader('Cache-Control', 'no-store, private');
        $this->browserRequest('GET', '/api/opportunities/'.$opportunity->id)->assertHeader('Cache-Control', 'no-store, private');
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload())->assertHeader('Cache-Control', 'no-store, private');
        $this->browserRequest('PUT', '/api/opportunities/'.$opportunity->id, opportunityPayload())->assertHeader('Cache-Control', 'no-store, private');
    });
});

describe('alta y autoría (CA-02, CA-03, CA-05)', function () {
    it('creates an opportunity owned by the session company and its account', function () {
        $other = Company::factory()->create();
        signInCompany($this);

        $response = $this->browserRequest('POST', '/api/opportunities', opportunityPayload([
            // El cliente no decide la empresa, la autoría, el punto ni el estado.
            'company_id' => $other->id, 'created_by' => 1, 'latitude' => 19.43, 'longitude' => -99.13, 'location' => 'POINT(-99.13 19.43)',
        ]))->assertCreated();

        $opportunity = Opportunity::query()->sole();
        expect($opportunity->company_id)->toBe($this->company->id)
            ->and($opportunity->created_by)->toBe($this->account->id)
            ->and($opportunity->is_active)->toBeTrue();
        $response->assertExactJson(['data' => [
            'id' => $opportunity->id,
            'title' => 'Automatización de línea de ensamble',
            'program' => 'Ingeniería Mecatrónica',
            'state_code' => '28',
            'municipality_code' => '28032',
            'municipality' => 'Reynosa',
            'vacancies' => 3,
            'is_active' => true,
            'created_at' => $opportunity->created_at->toISOString(),
            'period_type' => 'semester',
            'period_number' => 5,
            'can_relocate' => false,
            'description' => 'Apoyo en la programación de PLC y en el mantenimiento preventivo de la línea.',
            'skills' => [['name' => 'PLC', 'kind' => 'technical'], ['name' => 'Trabajo en equipo', 'kind' => 'soft']],
            'language_code' => 'en',
            'min_level' => 4,
            'created_by' => ['id' => $this->account->id, 'name' => 'Reclutadora Titular'],
            'updated_at' => $opportunity->updated_at->toISOString(),
        ]]);
    });

    it('derives the point from the municipality seat and never exposes it (CA-05)', function () {
        signInCompany($this);
        $id = $this->browserRequest('POST', '/api/opportunities', opportunityPayload([
            'state_code' => '19', 'municipality_code' => '19039', 'latitude' => 0, 'longitude' => 0,
        ]))->assertCreated()->json('data.id');

        $sameAsSeat = DB::selectOne('SELECT ST_Equals(o.location::geometry, m.location::geometry) AS same FROM opportunities o
            JOIN municipalities m ON m.code = ? WHERE o.id = ?', ['19039', $id])->same;
        expect($sameAsSeat)->toBeTrue();

        // Al cambiar de municipio, el punto se recalcula.
        $this->browserRequest('PUT', '/api/opportunities/'.$id, opportunityPayload())->assertOk();
        $sameAsReynosa = DB::selectOne('SELECT ST_Equals(o.location::geometry, m.location::geometry) AS same FROM opportunities o
            JOIN municipalities m ON m.code = ? WHERE o.id = ?', ['28032', $id])->same;
        expect($sameAsReynosa)->toBeTrue();

        $body = $this->browserRequest('GET', '/api/opportunities/'.$id)->getContent().
            $this->browserRequest('GET', '/api/opportunities')->getContent();
        expect($body)->not->toContain('location')->not->toContain('latitude')->not->toContain('company_id');
    });

    it('accepts an opportunity without skills nor language', function () {
        signInCompany($this);
        $payload = opportunityPayload(['language_code' => null, 'min_level' => null]);
        unset($payload['skills']);

        $this->browserRequest('POST', '/api/opportunities', $payload)->assertCreated()
            ->assertJsonPath('data.skills', [])
            ->assertJsonPath('data.language_code', null)
            ->assertJsonPath('data.min_level', null);
    });

    it('reuses the shared catalog and normalizes repeated skills', function () {
        Skill::query()->forceCreate(['name' => 'Python', 'slug' => 'python', 'kind' => 'technical']);
        signInCompany($this);

        $this->browserRequest('POST', '/api/opportunities', opportunityPayload(['skills' => [
            ['name' => '  python ', 'kind' => 'soft'], ['name' => 'Control  Numérico', 'kind' => 'technical'], ['name' => 'PYTHON', 'kind' => 'technical'],
        ]]))->assertCreated()->assertJsonPath('data.skills', [
            ['name' => 'Python', 'kind' => 'technical'], ['name' => 'Control Numérico', 'kind' => 'technical'],
        ]);
        expect(Skill::query()->where('slug', 'python')->count())->toBe(1)
            ->and(Skill::query()->where('slug', 'control numerico')->value('name'))->toBe('Control Numérico');
    });
});

describe('validación (CA-03, CA-04)', function () {
    beforeEach(fn () => signInCompany($this));

    it('rejects invalid fields', function (array $overrides, string $field) {
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload($overrides))
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        expect(Opportunity::query()->count())->toBe(0);
    })->with([
        'sin título' => [['title' => ''], 'title'],
        'título largo' => [['title' => str_repeat('a', 151)], 'title'],
        'sin carrera' => [['program' => null], 'program'],
        'carrera larga' => [['program' => str_repeat('a', 151)], 'program'],
        'tipo de periodo' => [['period_type' => 'year'], 'period_type'],
        'periodo 0' => [['period_number' => 0], 'period_number'],
        'periodo 16' => [['period_number' => 16], 'period_number'],
        'vacantes 0' => [['vacancies' => 0], 'vacancies'],
        'vacantes 51' => [['vacancies' => 51], 'vacancies'],
        'vacantes decimales' => [['vacancies' => 2.5], 'vacancies'],
        'reubicación' => [['can_relocate' => 'tal vez'], 'can_relocate'],
        'sin reubicación' => [['can_relocate' => null], 'can_relocate'],
        'estado' => [['state_code' => '33'], 'state_code'],
        'municipio de otro estado' => [['municipality_code' => '19039'], 'municipality_code'],
        'municipio inexistente' => [['municipality_code' => '28999'], 'municipality_code'],
        'sin descripción' => [['description' => ''], 'description'],
        'descripción larga' => [['description' => str_repeat('a', 1501)], 'description'],
        '16 habilidades' => [['skills' => array_map(fn (int $i): array => ['name' => "Skill $i", 'kind' => 'technical'], range(1, 16))], 'skills'],
        'habilidad sin tipo' => [['skills' => [['name' => 'PLC']]], 'skills.0.kind'],
        'habilidad con otra clave' => [['skills' => [['name' => 'PLC', 'kind' => 'technical', 'id' => 1]]], 'skills.0'],
        'idioma sin nivel' => [['min_level' => null], 'min_level'],
        'nivel sin idioma' => [['language_code' => null], 'language_code'],
        'idioma desconocido' => [['language_code' => 'xx'], 'language_code'],
        'nivel 8' => [['min_level' => 8], 'min_level'],
        'estado activo' => [['is_active' => false], 'is_active'],
    ]);

    it('rejects contact information in free text and new skill names (CA-04)', function (string $field, array $overrides) {
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload($overrides))
            ->assertUnprocessable()->assertJsonValidationErrors([$field => ContactInformation::OPPORTUNITY_MESSAGE]);
    })->with([
        ['title', ['title' => 'Escríbenos a rh@empresa.mx']],
        ['program', ['program' => 'Mecatrónica, ver https://empresa.mx']],
        ['description', ['description' => 'Llama al 899 123 4567 para más información.']],
        ['description', ['description' => 'Detalles en empresa.com.mx/vacantes']],
        ['skills.0.name', ['skills' => [['name' => 'wa.me/528991234567', 'kind' => 'technical']]]],
    ]);

    it('allows 15 skills', function () {
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload([
            'skills' => array_map(fn (int $i): array => ['name' => "Skill $i", 'kind' => 'technical'], range(1, 15)),
        ]))->assertCreated()->assertJsonCount(15, 'data.skills');
    });
});

describe('ubicación por defecto (CA-05)', function () {
    it('returns the session company municipality to prefill the form', function () {
        Company::factory()->create(['state_code' => '19', 'municipality_code' => '19039']);
        signInCompany($this);

        $this->browserRequest('GET', '/api/opportunities/defaults')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => ['state_code' => '28', 'municipality_code' => '28032', 'municipality' => 'Reynosa']]);
    });

    it('is only for COMPANY accounts', function () {
        $this->loginWithCookies(User::factory()->role(UserRole::SECRETARY)->create())->assertOk();
        $this->browserRequest('GET', '/api/opportunities/defaults')->assertForbidden();
    });
});

describe('listado (CA-06)', function () {
    it('lists only its own opportunities, newest first, 20 per page', function () {
        $start = now()->subDays(30);
        foreach (range(1, 21) as $i) {
            $this->travelTo($start->copy()->addDays($i));
            opportunityFor($this->company, ['title' => "Oportunidad $i", 'is_active' => $i !== 21]);
        }
        $this->travelBack();
        opportunityFor(Company::factory()->create(), ['title' => 'Ajena']);
        signInCompany($this);

        $first = $this->browserRequest('GET', '/api/opportunities')->assertOk();
        expect(array_column($first->json('data'), 'title'))->toBe(array_map(fn (int $i): string => "Oportunidad $i", range(21, 2)));
        expect($first->json('meta'))->toBe(['current_page' => 1, 'last_page' => 2, 'total' => 21, 'per_page' => 20]);
        expect($first->json('data.0.is_active'))->toBeFalse();

        $second = $this->browserRequest('GET', '/api/opportunities?page=2')->assertOk();
        expect(array_column($second->json('data'), 'title'))->toBe(['Oportunidad 1']);
    });

    it('shows title, program, municipality, vacancies, status and the main skills', function () {
        signInCompany($this);
        $this->browserRequest('POST', '/api/opportunities', opportunityPayload([
            'skills' => array_map(fn (int $i): array => ['name' => "Skill $i", 'kind' => 'technical'], range(1, 7)),
        ]))->assertCreated();

        $item = $this->browserRequest('GET', '/api/opportunities')->assertOk()->json('data.0');
        expect(array_keys($item))->toBe(['id', 'title', 'program', 'state_code', 'municipality_code', 'municipality', 'vacancies', 'is_active', 'created_at', 'skills'])
            ->and($item['municipality'])->toBe('Reynosa')
            ->and(array_column($item['skills'], 'name'))->toBe(['Skill 1', 'Skill 2', 'Skill 3', 'Skill 4', 'Skill 5']);
    });
});

describe('consulta y edición con aislamiento (CA-02)', function () {
    it('shows and edits its own opportunity', function () {
        signInCompany($this);
        $id = $this->browserRequest('POST', '/api/opportunities', opportunityPayload())->assertCreated()->json('data.id');

        $this->browserRequest('PUT', '/api/opportunities/'.$id, opportunityPayload([
            'title' => 'Mantenimiento predictivo', 'vacancies' => 5, 'can_relocate' => true,
            'skills' => [['name' => 'Vibraciones', 'kind' => 'technical']], 'language_code' => null, 'min_level' => null,
        ]))->assertOk()
            ->assertJsonPath('data.title', 'Mantenimiento predictivo')
            ->assertJsonPath('data.vacancies', 5)
            ->assertJsonPath('data.can_relocate', true)
            ->assertJsonPath('data.skills', [['name' => 'Vibraciones', 'kind' => 'technical']])
            ->assertJsonPath('data.language_code', null);

        $this->browserRequest('GET', '/api/opportunities/'.$id)->assertOk()->assertJsonPath('data.title', 'Mantenimiento predictivo');
        expect(DB::table('opportunity_skills')->where('opportunity_id', $id)->count())->toBe(1);
    });

    it('keeps the company and author when another account of the same company edits it', function () {
        $opportunity = opportunityFor($this->company);
        $author = $opportunity->created_by;
        signInCompany($this);

        $this->browserRequest('PUT', '/api/opportunities/'.$opportunity->id, opportunityPayload(['company_id' => 999, 'created_by' => $this->account->id]))->assertOk();
        expect($opportunity->refresh()->company_id)->toBe($this->company->id)->and($opportunity->created_by)->toBe($author);
    });

    it('answers 404 for another company opportunity exactly like a missing one', function () {
        $foreign = opportunityFor(Company::factory()->create(), ['title' => 'Ajena']);
        signInCompany($this);

        foreach ([$foreign->id, 999999] as $id) {
            $this->browserRequest('GET', '/api/opportunities/'.$id)->assertNotFound()->assertExactJson(['message' => 'La oportunidad no existe.']);
            $this->browserRequest('PUT', '/api/opportunities/'.$id, opportunityPayload())->assertNotFound()->assertExactJson(['message' => 'La oportunidad no existe.']);
        }
        expect($foreign->refresh()->title)->toBe('Ajena');
    });

    it('answers 404 to malformed or out-of-range identifiers', function (string $id) {
        signInCompany($this);
        $this->browserRequest('GET', '/api/opportunities/'.$id)->assertNotFound();
    })->with(['0', 'abc', '-1', '1.5', '1234567890123456789']);
});
