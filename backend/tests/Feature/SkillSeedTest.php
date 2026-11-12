<?php

use App\Models\Skill;
use App\Support\CatalogSlug;
use App\Support\SkillCatalog;
use App\Support\SkillSeedCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;

// HU-S10-01: catálogo semilla de habilidades con `php artisan skills:seed`.
uses(RefreshDatabase::class);

function seedSkillsCsv(string $contents): string
{
    $path = tempnam(sys_get_temp_dir(), 'skills');
    file_put_contents($path, $contents);

    return $path;
}

function seedSkillsSnapshot(): array
{
    return Skill::query()->orderBy('id')->get(['id', 'name', 'slug', 'kind', 'aliases', 'updated_at'])->toArray();
}

it('keeps the skills catalog empty after migrating: the seed is not part of a migration (CA-03)', function () {
    expect(Skill::count())->toBe(0);
});

it('versions a valid curated seed of 500 to 1,000 skills with aliases', function () {
    $rows = SkillSeedCatalog::rows();
    $kinds = array_count_values(array_column($rows, 'kind'));
    $aliases = collect($rows)->pluck('aliases', 'name')->filter();

    expect(count($rows))->toBeGreaterThanOrEqual(500)->toBeLessThanOrEqual(1000);
    expect(array_keys($kinds))->toEqualCanonicalizing(['technical', 'soft']);
    expect(collect($rows)->every(fn (array $row): bool => mb_strlen($row['name']) <= 80))->toBeTrue();
    expect(collect($rows)->pluck('slug')->duplicates())->toBeEmpty();
    expect($aliases->count())->toBeGreaterThanOrEqual(5);
    expect($aliases['JavaScript'])->toBe(['js']);
    expect($aliases['C#'])->toBe(['c sharp', 'csharp']);
    // Un alias no repite el nombre de ninguna habilidad: esa búsqueda ya la resuelve el prefijo.
    expect($aliases->flatten()->intersect(collect($rows)->pluck('slug')))->toBeEmpty();
});

it('loads every skill of the seed with its name, kind and aliases (CA-01)', function () {
    $rows = SkillSeedCatalog::rows();

    $this->artisan('skills:seed')
        ->expectsOutput('Catálogo semilla: '.count($rows).' habilidades; '.count($rows).' agregadas, 0 actualizadas, 0 sin cambios.')
        ->assertSuccessful();

    expect(Skill::count())->toBe(count($rows));
    expect(Skill::where('slug', 'javascript')->first())->name->toBe('JavaScript')->kind->value->toBe('technical')->aliases->toBe(['js']);
    expect(Skill::where('slug', 'c#')->first())->name->toBe('C#')->aliases->toBe(['c sharp', 'csharp']);
    expect(Skill::where('slug', 'trabajo en equipo')->first())->name->toBe('Trabajo en equipo')->kind->value->toBe('soft')->aliases->toBe([]);
    // Un mismo alias puede apuntar a varias habilidades.
    expect(Skill::whereJsonContains('aliases', 'bd')->count())->toBe(2);
});

it('is idempotent: a second run changes nothing (CA-02, CA-04)', function () {
    $this->artisan('skills:seed')->assertSuccessful();
    $snapshot = seedSkillsSnapshot();
    $total = count($snapshot);

    $this->travel(1)->hours();
    $this->artisan('skills:seed')
        ->expectsOutput("Catálogo semilla: {$total} habilidades; 0 agregadas, 0 actualizadas, {$total} sin cambios.")
        ->assertSuccessful();

    expect(seedSkillsSnapshot())->toBe($snapshot);
});

it('updates the kind and aliases of existing skills by slug but never their name (CA-02)', function () {
    Skill::query()->forceCreate(['name' => 'javascript', 'slug' => 'javascript', 'kind' => 'soft']);
    Skill::query()->forceCreate(['name' => 'Liderazgo', 'slug' => 'liderazgo', 'kind' => 'soft', 'aliases' => ['jefatura']]);
    $ids = Skill::query()->pluck('id', 'slug');
    $rows = count(SkillSeedCatalog::rows());

    $this->artisan('skills:seed')
        ->expectsOutput('Catálogo semilla: '.$rows.' habilidades; '.($rows - 2).' agregadas, 2 actualizadas, 0 sin cambios.')
        ->assertSuccessful();

    // El catálogo curado corrige el tipo y los alias; el nombre y el id son de quien la registró.
    expect(Skill::where('slug', 'javascript')->first())
        ->id->toBe($ids['javascript'])->name->toBe('javascript')->kind->value->toBe('technical')->aliases->toBe(['js']);
    expect(Skill::where('slug', 'liderazgo')->first())->id->toBe($ids['liderazgo'])->aliases->toBe([]);
    expect(Skill::count())->toBe($rows);
});

it('does not touch skills that are not part of the seed (CA-02)', function () {
    Skill::query()->forceCreate(['name' => 'Soldadura submarina', 'slug' => 'soldadura submarina', 'kind' => 'soft', 'aliases' => ['buceo']]);
    $before = Skill::where('slug', 'soldadura submarina')->first()->toArray();

    $this->travel(1)->hours();
    $this->artisan('skills:seed')->assertSuccessful();

    expect(Skill::where('slug', 'soldadura submarina')->first()->toArray())->toBe($before);
    expect(Skill::count())->toBe(count(SkillSeedCatalog::rows()) + 1);
});

it('normalizes the aliases of a file and drops empty or redundant ones', function () {
    $path = seedSkillsCsv("name,kind,aliases\nAnálisis de datos,technical, Analítica |DA||analisis de datos|da\nReact,technical,\n");

    $this->artisan('skills:seed', ['--path' => $path])->assertSuccessful();

    expect(Skill::where('slug', 'analisis de datos')->value('aliases'))->toBe(['analitica', 'da']);
    expect(Skill::where('slug', 'react')->value('aliases'))->toBe([]);
    unlink($path);
});

it('rejects an invalid file without writing anything', function (string $contents, string $message) {
    Skill::query()->forceCreate(['name' => 'React', 'slug' => 'react', 'kind' => 'soft']);
    $path = seedSkillsCsv($contents);

    $this->artisan('skills:seed', ['--path' => $path])->expectsOutputToContain($message)->assertFailed();

    expect(Skill::count())->toBe(1);
    expect(Skill::where('slug', 'react')->value('kind')->value)->toBe('soft');
    unlink($path);
})->with([
    'old header' => ["name,kind\nReact,technical\n", 'El encabezado del catálogo de habilidades'],
    'missing column' => ["name,kind,aliases\nReact,technical\n", 'Renglón 2 inválido'],
    'unknown kind' => ["name,kind,aliases\nReact,technical,\nVue.js,hard,\n", 'Renglón 3 inválido'],
    'empty name' => ["name,kind,aliases\n  ,soft,\n", 'Renglón 2 inválido'],
    'name over 80' => ["name,kind,aliases\n".str_repeat('a', 81).",technical,\n", 'Renglón 2 inválido'],
    'alias over 80' => ["name,kind,aliases\nReact,technical,".str_repeat('a', 81)."\n", 'un alias supera 80 caracteres'],
    'repeated slug' => ["name,kind,aliases\nAnálisis de datos,technical,\nanalisis  de DATOS,technical,\n", 'repite la habilidad del renglón 2'],
]);

it('fails clearly when the file does not exist', function () {
    $this->artisan('skills:seed', ['--path' => '/nonexistent/skills.csv'])
        ->expectsOutputToContain('No se pudo abrir el catálogo de habilidades')
        ->assertFailed();
});

it('keeps new skills registered by accounts without aliases', function () {
    SkillCatalog::ids(SkillCatalog::normalize([['name' => 'Soldadura submarina', 'kind' => 'technical']]));

    expect(Skill::where('slug', CatalogSlug::from('Soldadura submarina'))->value('aliases'))->toBe([]);
});
