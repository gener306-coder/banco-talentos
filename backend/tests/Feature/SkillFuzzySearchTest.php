<?php

use App\Models\Institution;
use App\Models\Skill;
use App\Models\User;
use App\Support\CatalogSlug;
use App\Support\SkillCatalog;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// T-S10-01: autocompletar de habilidades tolerante a errores, en tres fases: prefijo o alias, trigramas y Levenshtein.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
    $this->loginWithCookies(User::factory()->forInstitution(Institution::factory()->create())->create())->assertOk();
});

function fuzzySkills(string ...$names): void
{
    foreach ($names as $name) {
        Skill::query()->forceCreate(['name' => $name, 'slug' => CatalogSlug::from($name), 'kind' => 'technical']);
    }
}

function aliasedSkill(string $name, string ...$aliases): void
{
    Skill::query()->forceCreate(['name' => $name, 'slug' => CatalogSlug::from($name), 'kind' => 'technical', 'aliases' => $aliases]);
}

/** @return list<array{0: string, 1: string}> [nombre, match] de cada resultado, en orden. */
function fuzzySearch($test, string $query): array
{
    return collect($test->browserRequest('GET', '/api/skills?q='.urlencode($query))->assertOk()->json('data'))
        ->map(fn (array $skill): array => [$skill['name'], $skill['match']])->all();
}

it('enables pg_trgm and fuzzystrmatch, adds aliases and keeps the B-tree prefix index (CA-01)', function () {
    expect(DB::table('pg_extension')->whereIn('extname', ['pg_trgm', 'fuzzystrmatch'])->count())->toBe(2);
    $column = DB::table('information_schema.columns')->where('table_name', 'skills')->where('column_name', 'aliases')->first();
    expect($column)->data_type->toBe('jsonb')->is_nullable->toBe('NO');
    // Savepoint: el INSERT rechazado no debe abortar la transacción de la prueba.
    expect(fn () => DB::transaction(fn () => DB::statement("INSERT INTO skills (name, slug, kind, aliases) VALUES ('X', 'x', 'soft', '{}')")))
        ->toThrow(QueryException::class);
    $indexes = DB::table('pg_indexes')->where('tablename', 'skills')->pluck('indexdef', 'indexname');

    expect($indexes['skills_slug_trgm_gist'])->toContain('USING gist (slug gist_trgm_ops)');
    expect($indexes['skills_slug_prefix_index'])->toContain('USING btree (slug text_pattern_ops)');
    expect($indexes['skills_aliases_gin'])->toContain('USING gin (aliases jsonb_path_ops)');
});

it('finds a skill by an exact alias and labels it alias (CA-02, CA-03)', function () {
    aliasedSkill('JavaScript', 'js');
    aliasedSkill('C#', 'c sharp', 'csharp');
    aliasedSkill('Modelado de bases de datos', 'bd');
    aliasedSkill('Normalización de bases de datos', 'bd');
    fuzzySkills('JSON Schema', 'Jest');

    // El alias exacto va antes que el resto del prefijo.
    expect(fuzzySearch($this, 'JS'))->toBe([['JavaScript', 'alias'], ['JSON Schema', 'prefix']]);
    expect(fuzzySearch($this, 'c sharp'))->toBe([['C#', 'alias']]);
    expect(fuzzySearch($this, 'C  Sharp'))->toBe([['C#', 'alias']]);
    expect(fuzzySearch($this, 'bd'))->toBe([['Modelado de bases de datos', 'alias'], ['Normalización de bases de datos', 'alias']]);
    // Un alias incompleto no coincide: solo el término exacto.
    expect(fuzzySearch($this, 'c sha'))->toBe([]);
    $this->browserRequest('GET', '/api/skills?q=csharp')->assertOk()->assertExactJson(['data' => [
        ['id' => Skill::where('slug', 'c#')->value('id'), 'name' => 'C#', 'kind' => 'technical', 'match' => 'alias'],
    ]]);
});

it('orders the exact name first, then aliases, then the rest of the prefix', function () {
    aliasedSkill('Inteligencia de negocios', 'bi');
    fuzzySkills('BigQuery', 'Bi', 'Big Data');

    expect(fuzzySearch($this, 'bi'))->toBe([['Bi', 'prefix'], ['Inteligencia de negocios', 'alias'], ['Big Data', 'prefix'], ['BigQuery', 'prefix']]);
});

it('labels prefix a skill that matches by both prefix and alias', function () {
    aliasedSkill('Go', 'golang');
    aliasedSkill('Golang avanzado', 'go');

    expect(fuzzySearch($this, 'go'))->toBe([['Go', 'prefix'], ['Golang avanzado', 'prefix']]);
});

it('resolves transposed letters in short words with Levenshtein (CA-02, CA-04)', function () {
    fuzzySkills('Python', 'Kotlin', 'Docker', 'Pandas');

    expect(fuzzySearch($this, 'pyhton'))->toBe([['Python', 'fuzzy']]);
    expect(fuzzySearch($this, 'kotiln'))->toBe([['Kotlin', 'fuzzy']]);
    expect(fuzzySearch($this, 'dokcer'))->toBe([['Docker', 'fuzzy']]);
});

it('allows one edit for 4–5 letters and two for 6–7, to keep noise out (CA-02)', function () {
    fuzzySkills('Jira', 'Sass', 'Rust', 'Swift', 'Kotlin');

    // «java» está a dos ediciones de Jira y de Sass: no deben aparecer.
    expect(fuzzySearch($this, 'java'))->toBe([]);
    expect(fuzzySearch($this, 'rsut'))->toBe([]);
    expect(fuzzySearch($this, 'rusk'))->toBe([['Rust', 'fuzzy']]);
    expect(fuzzySearch($this, 'swfit'))->toBe([]);
    expect(fuzzySearch($this, 'swiff'))->toBe([['Swift', 'fuzzy']]);
    expect(fuzzySearch($this, 'kotiln'))->toBe([['Kotlin', 'fuzzy']]);
});

it('runs Levenshtein only for queries of 4 to 7 characters (CA-02)', function () {
    fuzzySkills('Lua', 'Selenium');

    expect(fuzzySearch($this, 'lau'))->toBe([]);
    // 8 caracteres: fuera de Levenshtein; los trigramas tampoco alcanzan esta inversión doble.
    expect(SkillCatalog::LEVENSHTEIN_MAX_LENGTH)->toBe(7);
    expect(collect(fuzzySearch($this, 'xelenuim'))->pluck(0))->not->toContain('Selenium');
});

it('tolerates typos: «javscript» suggests JavaScript as a fuzzy match (CA-02, CA-04)', function () {
    fuzzySkills('JavaScript', 'TypeScript', 'Java', 'Excel avanzado');

    // «javascrip» (incompleta) ya llega por prefijo; los errores en medio de la palabra, por similitud.
    expect(fuzzySearch($this, 'javascrip'))->toBe([['JavaScript', 'prefix']]);
    expect(fuzzySearch($this, 'javscript'))->toBe([['JavaScript', 'fuzzy']]);
    expect(fuzzySearch($this, 'javascrpt'))->toBe([['JavaScript', 'fuzzy']]);
    expect(fuzzySearch($this, 'Soldadura'))->toBe([]);
});

it('returns the full contract with id, name, kind and match (CA-03)', function () {
    fuzzySkills('JavaScript');
    $skill = Skill::where('slug', 'javascript')->first();

    $this->browserRequest('GET', '/api/skills?q=javscript')->assertOk()
        ->assertExactJson(['data' => [['id' => $skill->id, 'name' => 'JavaScript', 'kind' => 'technical', 'match' => 'fuzzy']]]);
});

it('always lists prefix matches before fuzzy ones and does not repeat them (CA-02, CA-04)', function () {
    fuzzySkills('React', 'React Native', 'Preact', 'Redux');

    expect(fuzzySearch($this, 'react'))->toBe([['React', 'prefix'], ['React Native', 'prefix'], ['Preact', 'fuzzy']]);
});

it('orders fuzzy matches by similarity', function () {
    fuzzySkills('Programación de PLC', 'Programación concurrente', 'Programación funcional');

    expect(fuzzySearch($this, 'programacion de plc')[0] ?? null)->toBe(['Programación de PLC', 'prefix']);
    expect(fuzzySearch($this, 'programasion de plc')[0] ?? null)->toBe(['Programación de PLC', 'fuzzy']);
});

it('skips the fuzzy phase when the prefix already fills the limit', function () {
    fuzzySkills('Exel avanzado', ...array_map(fn (int $i): string => sprintf('Excel %02d', $i), range(1, 10)));

    expect(collect(fuzzySearch($this, 'excel'))->pluck(1)->unique()->all())->toBe(['prefix']);
    expect(fuzzySearch($this, 'excel'))->toHaveCount(10);
});

it('does not run the fuzzy phase for queries with fewer than three alphanumeric characters (CA-04)', function () {
    fuzzySkills('Lenguaje Go', 'Lenguaje Rust');

    // «go» está completo dentro de «lenguaje go»: la fase difusa lo sugeriría si corriera.
    expect(fuzzySearch($this, 'go'))->toBe([]);
    expect(fuzzySearch($this, 'rust'))->toBe([['Lenguaje Rust', 'fuzzy']]);
});

it('resolves symbols like C#, C++ and .NET by prefix (CA-04)', function () {
    fuzzySkills('C', 'C#', 'C++', 'Clean Code', '.NET', '.NET MAUI', 'ASP.NET Core');

    expect(fuzzySearch($this, 'c#'))->toBe([['C#', 'prefix']]);
    expect(fuzzySearch($this, 'C++'))->toBe([['C++', 'prefix']]);
    expect(fuzzySearch($this, 'c'))->toBe([['C', 'prefix'], ['C#', 'prefix'], ['C++', 'prefix'], ['Clean Code', 'prefix']]);
    expect(fuzzySearch($this, '.net')[0] ?? null)->toBe(['.NET', 'prefix']);
    expect(collect(fuzzySearch($this, '.net'))->take(2)->all())->toBe([['.NET', 'prefix'], ['.NET MAUI', 'prefix']]);
});

it('keeps % and _ literal in both phases', function () {
    fuzzySkills('React', '100% remoto');

    expect(fuzzySearch($this, '%'))->toBe([]);
    expect(fuzzySearch($this, 're_'))->toBe([]);
    expect(fuzzySearch($this, '100%'))->toBe([['100% remoto', 'prefix']]);
});

it('finds the seeded catalog with typos', function () {
    $this->artisan('skills:seed')->assertSuccessful();

    expect(fuzzySearch($this, 'javscript')[0] ?? null)->toBe(['JavaScript', 'fuzzy']);
    expect(fuzzySearch($this, 'pyhton')[0] ?? null)->toBe(['Python', 'fuzzy']);
    expect(fuzzySearch($this, 'js')[0] ?? null)->toBe(['JavaScript', 'alias']);
    expect(fuzzySearch($this, 'c sharp'))->toBe([['C#', 'alias']]);
    expect(fuzzySearch($this, 'ml')[0] ?? null)->toBe(['Aprendizaje automático', 'alias']);
    expect(collect(fuzzySearch($this, 'bd'))->where(1, 'alias')->pluck(0)->all())
        ->toBe(['Modelado de bases de datos', 'Normalización de bases de datos']);
    expect(fuzzySearch($this, 'solidwork')[0] ?? null)->toBe(['SolidWorks', 'prefix']);
    expect(fuzzySearch($this, 'contpaq')[0] ?? null)->toBe(['CONTPAQi', 'prefix']);
    expect(fuzzySearch($this, 'liderasgo')[0] ?? null)->toBe(['Liderazgo', 'fuzzy']);
    expect(fuzzySearch($this, 'mantenimiento preventibo')[0] ?? null)->toBe(['Mantenimiento preventivo', 'fuzzy']);
});
