<?php

use App\Models\User;
use App\Support\SocialSecurityNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Support\InteractsWithCookieSessions;

// Simulación de carga (tarea transversal): el generador respeta el esquema y la privacidad, y solo corre en su base.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

const SIMULATION_PASSWORD = 'simulacion-de-carga-segura';

function simulationSeed(array $options = []): int
{
    return Artisan::call('simulation:seed', [
        '--institutions' => 2, '--students' => 25, '--companies' => 4, '--opportunities' => 8, '--linkages' => 15,
        '--password' => SIMULATION_PASSWORD, ...$options,
    ]);
}

it('loads a small consistent dataset with demo accounts that can sign in', function () {
    expect(simulationSeed())->toBe(0);

    expect(DB::table('institutions')->count())->toBe(2)
        ->and(DB::table('institutions')->where('is_active', false)->count())->toBe(1)
        ->and(DB::table('students')->count())->toBeGreaterThan(20)
        ->and(DB::table('companies')->count())->toBe(4)
        ->and(DB::table('opportunities')->count())->toBe(8)
        ->and(DB::table('student_identities')->count())->toBe(DB::table('students')->count());

    // Cada alumno buscable tiene ubicación; ninguno sin municipio ni estado la tiene.
    expect(DB::table('students')->whereNotNull('municipality_code')->whereNull('location')->count())->toBe(0)
        ->and(DB::table('students')->whereNull('state_code')->whereNotNull('location')->count())->toBe(0);

    // Las solicitudes son coherentes con su alumno, su oportunidad y quién respondió.
    expect(DB::table('linkage_requests')->count())->toBeGreaterThan(0);
    $inconsistent = DB::table('linkage_requests as l')
        ->join('students as s', 's.id', '=', 'l.student_id')
        ->join('opportunities as o', 'o.id', '=', 'l.opportunity_id')
        ->leftJoin('users as r', 'r.id', '=', 'l.responded_by')
        ->where(fn ($query) => $query->whereColumn('s.institution_id', '<>', 'l.institution_id')
            ->orWhereColumn('o.company_id', '<>', 'l.company_id')
            ->orWhere(fn ($answered) => $answered->whereIn('l.status', ['ACEPTADA', 'RECHAZADA'])
                ->where(fn ($bad) => $bad->whereNull('l.responded_at')->orWhereColumn('r.institution_id', '<>', 'l.institution_id')))
            ->orWhere(fn ($open) => $open->whereIn('l.status', ['PENDIENTE_INSTITUCION', 'CANCELADA'])->whereNotNull('l.responded_by'))
            ->orWhereColumn('l.created_at', '<', 's.created_at'))
        ->count();
    expect($inconsistent)->toBe(0);

    // El NSS cifrado se descifra y es válido.
    $security = DB::table('student_social_security')->first();
    expect(SocialSecurityNumber::isValid(decrypt($security->nss, false)))->toBeTrue();

    foreach (['admin', 'secretaria01', 'institucion01-1', 'empresa001-1'] as $local) {
        $this->initializeCookieBrowser();
        $this->loginWithCookies(User::query()->where('email', "{$local}@sim.test")->firstOrFail(), ['password' => SIMULATION_PASSWORD])->assertOk();
    }
});

it('refuses to load over existing data without --fresh', function () {
    simulationSeed();

    expect(simulationSeed())->toBe(1)
        ->and(Artisan::output())->toContain('ya tiene datos');
});

it('validates its options', function (array $options) {
    expect(simulationSeed($options))->toBe(1);
})->with([
    'no institutions' => [['--institutions' => 0]],
    'unknown state' => [['--state' => '33']],
    'short password' => [['--password' => 'corta']],
]);

it('refuses to run outside the simulation or testing database', function (string $command) {
    config(['database.connections.pgsql.database' => 'banco_talentos']);

    expect(Artisan::call($command))->toBe(1)
        ->and(Artisan::output())->toContain('solo corren con APP_ENV=simulation');
})->with(['simulation:seed', 'simulation:benchmark', 'simulation:explain']);
