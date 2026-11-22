<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

beforeEach(function () {
    $this->initializeCookieBrowser();
});

function institutionPayload(array $overrides = []): array
{
    return array_replace([
        'name' => 'Instituto de Educación Dual',
        'cct' => '09DIT0001A',
        'contact_name' => 'María Fernanda López',
        'contact_email' => 'contacto@example.test',
    ], $overrides);
}

/** HU-S16-06: la invitación solo lleva el correo de la cuenta y, opcionales, el nombre y el de la persona. */
function institutionInvite(array $overrides = []): array
{
    return array_replace(['email' => 'contacto@example.test'], $overrides);
}

/** Cuerpo válido de cada acción: la invitación es ligera; la edición acepta el perfil completo. */
function institutionWritePayload(string $method): array
{
    return match ($method) {
        'POST' => institutionInvite(),
        'PATCH' => ['is_active' => false],
        default => institutionPayload(),
    };
}

dataset('institution endpoints', [
    'list' => ['GET', '/api/institutions'],
    'create' => ['POST', '/api/institutions'],
    'show' => ['GET', '/api/institutions/{id}'],
    'update' => ['PUT', '/api/institutions/{id}'],
    'status' => ['PATCH', '/api/institutions/{id}/status'],
]);

dataset('institution unauthorized roles', [
    'institution' => [UserRole::INSTITUTION],
    'company' => [UserRole::COMPANY],
    'secretary' => [UserRole::SECRETARY],
]);

dataset('invalid institution invitations', [
    'missing email' => [[], ['email']],
    'null email' => [institutionInvite(['email' => null]), ['email']],
    'blank email' => [institutionInvite(['email' => '   ']), ['email']],
    'non-string email' => [institutionInvite(['email' => ['invalid']]), ['email']],
    'malformed email' => [institutionInvite(['email' => 'not-an-email']), ['email']],
    'long email' => [institutionInvite([
        'email' => str_repeat('a', 64).'@'.str_repeat('b', 62).'.'.str_repeat('c', 62).'.'.str_repeat('d', 59).'.test',
    ]), ['email']],
    'non-string name' => [institutionInvite(['name' => ['invalid']]), ['name']],
    'long name' => [institutionInvite(['name' => str_repeat('n', 256)]), ['name']],
    'long person name' => [institutionInvite(['person_name' => str_repeat('p', 121)]), ['person_name']],
    // D5: el perfil lo captura la institución; la invitación no lo acepta.
    'profile field' => [institutionInvite(['cct' => '09DIT0001A']), ['cct']],
    'contact field' => [institutionInvite(['contact_email' => 'otro@example.test']), ['contact_email']],
]);

dataset('invalid institution updates', [
    'non-string name' => [institutionPayload(['name' => ['invalid']]), ['name']],
    'long name' => [institutionPayload(['name' => str_repeat('n', 256)]), ['name']],
    'numeric cct' => [institutionPayload(['cct' => 12345]), ['cct']],
    'long cct' => [institutionPayload(['cct' => str_repeat('c', 256)]), ['cct']],
    'non-string contact email' => [institutionPayload(['contact_email' => ['invalid']]), ['contact_email']],
    'malformed contact email' => [institutionPayload(['contact_email' => 'not-an-email']), ['contact_email']],
    'long contact email' => [institutionPayload([
        'contact_email' => str_repeat('a', 64).'@'.str_repeat('b', 62).'.'.str_repeat('c', 62).'.'.str_repeat('d', 59).'.test',
    ]), ['contact_email']],
    'long contact name' => [institutionPayload(['contact_name' => str_repeat('r', 121)]), ['contact_name']],
]);

it('allows an administrator to list every institution, paginated, by name and with the unnamed ones last (HU-S16-05)', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $this->browserRequest('GET', '/api/institutions')->assertOk()
        ->assertExactJson(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'total' => 0]]);
    $zeta = Institution::factory()->inactive()->create(['name' => 'Zeta']);
    $alfa = Institution::factory()->create(['name' => 'Alfa']);
    $unnamed = Institution::factory()->create(['name' => null, 'cct' => null, 'contact_email' => null]);

    $this->browserRequest('GET', '/api/institutions')
        ->assertOk()->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonCount(3, 'data')
        ->assertJsonPath('meta.total', 3)
        ->assertJsonPath('data.0.id', $alfa->id)
        ->assertJsonPath('data.1.id', $zeta->id)
        ->assertJsonPath('data.1.is_active', false)
        ->assertJsonPath('data.2.id', $unnamed->id)
        ->assertJsonPath('data.2.name', null)
        ->assertJsonPath('data.2.profile_status', 'pending_access');
});

it('invites an institution with only the account email, active and without a profile (HU-S16-06)', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $id = $this->browserRequest('POST', '/api/institutions', institutionInvite())
        ->assertCreated()
        ->assertJsonPath('data.name', null)
        ->assertJsonPath('data.cct', null)
        ->assertJsonPath('data.contact_name', null)
        ->assertJsonPath('data.contact_email', null)
        ->assertJsonPath('data.is_active', true)
        ->json('data.id');

    $institution = Institution::sole();
    expect($institution->id)->toBe($id)
        ->and($institution->is_active)->toBeTrue()
        ->and($institution->missing())->toBe(Institution::MINIMUM)
        // D7 solo aplica a las existentes: la invitada ve su bienvenida al entrar (HU-S16-07).
        ->and($institution->onboarding_dismissed_at)->toBeNull();
});

it('accepts invitation and edition values at their supported length limits', function () {
    Notification::fake();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $email = str_repeat('a', 64).'@'.str_repeat('b', 62).'.'.str_repeat('c', 62).'.'.str_repeat('d', 58).'.test';
    $id = $this->browserRequest('POST', '/api/institutions', ['email' => $email, 'name' => str_repeat('n', 255), 'person_name' => str_repeat('p', 120)])
        ->assertCreated()->json('data.id');
    expect(User::query()->where('institution_id', $id)->sole()->name)->toBe(str_repeat('p', 120));

    $payload = institutionPayload([
        'name' => str_repeat('m', 255),
        // T-S14-15: el CCT tiene un formato fijo de 10 caracteres.
        'cct' => '09DIT0010Z',
        'contact_name' => str_repeat('r', 120),
        'contact_position' => str_repeat('p', 120),
        'contact_email' => $email,
        'contact_phone' => '+52 (834) 123-4567 8',
    ]);
    $this->browserRequest('PUT', '/api/institutions/'.$id, $payload)->assertOk();

    $this->assertDatabaseHas('institutions', ['id' => $id, ...$payload]);
});

it('allows an administrator to view an institution including when it is inactive', function () {
    $institution = Institution::factory()->inactive()->create(institutionPayload());
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('GET', '/api/institutions/'.$institution->id)
        ->assertOk()
        ->assertJsonPath('data.id', $institution->id)
        ->assertJsonPath('data.name', $institution->name)
        ->assertJsonPath('data.cct', $institution->cct)
        ->assertJsonPath('data.contact_email', $institution->contact_email)
        ->assertJsonPath('data.is_active', false);
});

it('allows an administrator to update institution data while preserving its state and identity', function () {
    $institution = Institution::factory()->inactive()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $payload = institutionPayload();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, $payload)
        ->assertOk()
        ->assertJsonPath('data.id', $institution->id)
        ->assertJsonPath('data.name', $payload['name'])
        ->assertJsonPath('data.cct', $payload['cct'])
        ->assertJsonPath('data.contact_email', $payload['contact_email'])
        ->assertJsonPath('data.is_active', false);

    $this->assertDatabaseCount('institutions', 1);
    $this->assertDatabaseHas('institutions', array_replace(institutionPayload(), ['id' => $institution->id, 'is_active' => false]));
});

it('rejects an invalid invitation without inserting a partial record', function (array $payload, array $fields) {
    $existing = Institution::factory()->create();
    $original = $existing->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institutions', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($fields);

    $this->assertDatabaseCount('institutions', 1);
    $this->assertDatabaseCount('users', 1);
    expect($existing->fresh()->getAttributes())->toBe($original);
})->with('invalid institution invitations');

it('rejects invalid updates without persisting any changed field', function (array $payload, array $fields) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($fields);

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with('invalid institution updates');

it('lets the administrator edit any subset of the data and saves a blank value as missing (HU-S16-06)', function () {
    $institution = Institution::factory()->create(institutionPayload(['contact_position' => 'Vinculación']));
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, [])->assertOk()->assertJsonPath('data.name', 'Instituto de Educación Dual');
    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, ['name' => 'Nuevo nombre', 'contact_position' => '  '])
        ->assertOk()
        ->assertJsonPath('data.name', 'Nuevo nombre')
        ->assertJsonPath('data.contact_position', null)
        ->assertJsonPath('data.cct', '09DIT0001A');
    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, ['cct' => null, 'contact_email' => ''])
        ->assertOk()->assertJsonPath('data.cct', null)->assertJsonPath('data.contact_email', null);
});

it('rejects a cct already used by an active or inactive institution on update', function (bool $active) {
    $existing = Institution::factory()->create(['cct' => '09DIT0001A', 'is_active' => $active]);
    $target = Institution::factory()->create();
    $originalExisting = $existing->refresh()->getAttributes();
    $originalTarget = $target->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$target->id, institutionPayload())
        ->assertUnprocessable()
        ->assertJsonValidationErrors('cct');

    $this->assertDatabaseCount('institutions', 2);
    expect($existing->fresh()->getAttributes())->toBe($originalExisting);
    expect($target->fresh()->getAttributes())->toBe($originalTarget);
})->with(['active' => [true], 'inactive' => [false]]);

it('allows an update to retain the institutions own cct', function () {
    $institution = Institution::factory()->create(['cct' => '09DIT0001A']);
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload())
        ->assertOk()
        ->assertJsonPath('data.cct', '09DIT0001A');

    $this->assertDatabaseHas('institutions', institutionPayload(['id' => $institution->id]));
});

it('returns a validation error and rolls back when a cct becomes occupied after request validation', function () {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $dispatcher = Institution::getEventDispatcher();
    Institution::setEventDispatcher(clone $dispatcher);

    try {
        $occupyCct = function (Institution $pending): void {
            // The FormRequest has already passed. Insert directly so only the
            // database constraint can detect this conflict during the save.
            DB::table('institutions')->insert(institutionPayload([
                'name' => 'Registro competidor',
                'cct' => $pending->cct,
            ]));
        };

        Institution::updating($occupyCct);

        $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cct');
    } finally {
        Institution::setEventDispatcher($dispatcher);
    }

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
    $this->assertDatabaseMissing('institutions', ['cct' => '09DIT0001A']);
});

// T-S14-15: el CCT se normaliza (mayúsculas, sin espacios ni guiones) y sigue el formato SEP; la unicidad se aplica al
// valor normalizado. Antes se guardaba tal cual y «exact-cct» y «Exact-Cct» convivían.
it('normalizes the cct, requires the SEP format and applies uniqueness to the normalized value, without making names and emails unique', function () {
    Institution::factory()->create(institutionPayload(['cct' => '09DIT0005B']));
    $target = Institution::factory()->invited()->create();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $uri = '/api/institutions/'.$target->id;

    $this->browserRequest('PUT', $uri, institutionPayload(['cct' => '09dit-0005 b']))
        ->assertUnprocessable()->assertJsonValidationErrors(['cct' => 'La Clave de Centro de Trabajo ya está registrada.']);
    $this->browserRequest('PUT', $uri, institutionPayload(['cct' => 'EXACT-CCT']))
        ->assertUnprocessable()->assertJsonValidationErrors(['cct' => \App\Rules\WorkCenterKey::MESSAGE]);
    $this->browserRequest('PUT', $uri, institutionPayload(['cct' => '09dit 0006 c']))
        ->assertOk()->assertJsonPath('data.cct', '09DIT0006C');

    $this->assertDatabaseCount('institutions', 2);
});

it('lets the admin keep an older cct without the SEP format while editing other data, and validates a new one (T-S14-15)', function () {
    $institution = Institution::factory()->create(institutionPayload(['cct' => 'CLAVE-ANTERIOR']));
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload(['cct' => 'CLAVE-ANTERIOR', 'name' => 'Nombre corregido']))
        ->assertOk()->assertJsonPath('data.cct', 'CLAVE-ANTERIOR');
    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload(['cct' => 'OTRA-CLAVE']))
        ->assertUnprocessable()->assertJsonValidationErrors(['cct' => \App\Rules\WorkCenterKey::MESSAGE]);
});

it('only permits status changes through the dedicated action', function (string $method, mixed $state) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $uri = '/api/institutions'.($method === 'PUT' ? '/'.$institution->id : '');

    $this->browserRequest($method, $uri, [...institutionWritePayload($method), 'is_active' => $state])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('is_active');

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with(['create' => ['POST'], 'update' => ['PUT']])
    ->with(['true' => [true], 'false' => [false], 'null' => [null], 'empty' => ['']]);

it('deactivates and reactivates an institution without losing its record or data', function () {
    $institution = Institution::factory()->create(institutionPayload());
    $original = $institution->only(['id', 'name', 'cct', 'contact_email', 'created_at']);
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    foreach ([false, false, true, true] as $active) {
        $this->browserRequest('PATCH', '/api/institutions/'.$institution->id.'/status', ['is_active' => $active])
            ->assertOk()
            ->assertJsonPath('data.id', $institution->id)
            ->assertJsonPath('data.is_active', $active);

        $this->assertDatabaseCount('institutions', 1);
        expect($institution->fresh()->is_active)->toBe($active);
        expect($institution->fresh()->only(array_keys($original)))->toEqual($original);
        $this->browserRequest('GET', '/api/institutions/'.$institution->id)
            ->assertOk()
            ->assertJsonPath('data.is_active', $active);
    }
});

it('rejects a missing or non-boolean status without changing the institution', function (array $payload) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PATCH', '/api/institutions/'.$institution->id.'/status', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('is_active');

    expect($institution->fresh()->getAttributes())->toBe($original);
})->with([
    'missing' => [[]],
    'null' => [['is_active' => null]],
    'empty' => [['is_active' => '']],
    'array' => [['is_active' => []]],
    'zero' => [['is_active' => 0]],
    'one' => [['is_active' => 1]],
    'string zero' => [['is_active' => '0']],
    'string one' => [['is_active' => '1']],
    'string false' => [['is_active' => 'false']],
    'string true' => [['is_active' => 'true']],
]);

it('rejects institution data in the status action even when the field is null', function (string $field, mixed $value) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PATCH', '/api/institutions/'.$institution->id.'/status', ['is_active' => false, $field => $value])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    expect($institution->fresh()->getAttributes())->toBe($original);
})->with(['name', 'cct', 'contact_email'])->with(['value' => ['attempted change'], 'null' => [null]]);

it('does not persist unvalidated fields from creation update or status requests', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $extra = ['id' => 99999999, 'created_at' => '2000-01-01 00:00:00', 'role' => 'ADMIN', 'deleted_at' => '2000-01-01'];
    // HU-S16-06: la invitación rechaza cualquier campo que no sea suyo.
    $this->browserRequest('POST', '/api/institutions', institutionInvite($extra))
        ->assertUnprocessable()->assertJsonValidationErrors(['id', 'created_at', 'role', 'deleted_at']);
    $this->assertDatabaseCount('institutions', 0);
    $institution = Institution::factory()->create();
    $createdAt = $institution->refresh()->getRawOriginal('created_at');

    foreach ([
        ['PUT', '/api/institutions/'.$institution->id, institutionPayload($extra)],
        ['PATCH', '/api/institutions/'.$institution->id.'/status', array_replace($extra, ['is_active' => false])],
    ] as [$method, $uri, $payload]) {
        $this->browserRequest($method, $uri, $payload)
            ->assertOk()
            ->assertJsonPath('data.id', $institution->id)
            ->assertJsonMissingPath('data.role')
            ->assertJsonMissingPath('data.deleted_at');

        expect($institution->fresh()->getRawOriginal('created_at'))->toBe($createdAt);
    }

    $this->assertDatabaseCount('institutions', 1);
});

it('rejects anonymous access to every administrative institution endpoint', function (string $method, string $uri) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->startCookieSession();
    $payload = institutionWritePayload($method);

    $this->browserRequest($method, str_replace('{id}', (string) $institution->id, $uri), $payload)
        ->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json');

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with('institution endpoints');

it('rejects each non-administrator role on every institution endpoint despite forged admin claims', function (UserRole $role, string $method, string $uri) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
    $payload = institutionWritePayload($method);
    $payload['role'] = 'ADMIN';

    $this->browserRequest($method, str_replace('{id}', (string) $institution->id, $uri).'?role=ADMIN', $payload, headers: ['X-Role' => 'ADMIN'])
        ->assertForbidden()
        ->assertHeader('Content-Type', 'application/json');

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with('institution unauthorized roles')->with('institution endpoints');

it('rejects a previously authenticated administrator after the account is deactivated', function (string $method, string $uri) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $admin = User::factory()->role(UserRole::ADMIN)->create();
    $this->loginWithCookies($admin)->assertOk();
    $admin->update(['is_active' => false]);
    $payload = institutionWritePayload($method);

    $this->browserRequest($method, str_replace('{id}', (string) $institution->id, $uri), $payload)->assertUnauthorized();

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with('institution endpoints');

it('preserves institution data when a write has missing or invalid csrf protection', function (string $method, ?string $token) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $uri = match ($method) {
        'POST' => '/api/institutions',
        'PUT' => '/api/institutions/'.$institution->id,
        'PATCH' => '/api/institutions/'.$institution->id.'/status',
    };
    $payload = institutionWritePayload($method);

    $this->browserRequest($method, $uri, $payload, csrf: false, headers: $token === null ? [] : ['X-XSRF-TOKEN' => $token])
        ->assertStatus(419);

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with(['POST', 'PUT', 'PATCH'])->with(['missing' => [null], 'invalid' => ['forged-csrf-token']]);

it('returns not found for an unknown or invalid institution id without changing existing data', function (string $method, string $id) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $uri = '/api/institutions/'.$id.($method === 'PATCH' ? '/status' : '');
    $payload = institutionWritePayload($method);

    $this->browserRequest($method, $uri, $payload)->assertNotFound();

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with(['GET', 'PUT', 'PATCH'])->with([
    'unknown' => ['99999999'],
    'non-numeric' => ['abc'],
    'zero' => ['0'],
    'negative' => ['-1'],
    'outside PostgreSQL bigint range' => ['9223372036854775808'],
]);

it('has no delete route or soft-delete column and cannot physically delete institutions through the api', function () {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    foreach (Route::getRoutes() as $route) {
        if (str_starts_with($route->uri(), 'api/institutions')) {
            expect($route->methods())->not->toContain('DELETE');
        }
    }

    expect(Schema::hasColumn('institutions', 'deleted_at'))->toBeFalse();

    foreach (['/api/institutions', '/api/institutions/'.$institution->id] as $uri) {
        $this->browserRequest('DELETE', $uri)->assertMethodNotAllowed();
        $this->assertDatabaseCount('institutions', 1);
        expect($institution->fresh()->getAttributes())->toBe($original);
    }
});

it('enforces unique cct values directly in PostgreSQL independently of request validation', function () {
    Institution::factory()->create(institutionPayload());

    try {
        DB::transaction(fn () => DB::table('institutions')->insert(institutionPayload()));
        $this->fail('PostgreSQL accepted a duplicate institution CCT.');
    } catch (QueryException $exception) {
        expect((string) $exception->getCode())->toBe('23505');
    }

    $this->assertDatabaseCount('institutions', 1);
});

it('keeps is_active required directly in PostgreSQL', function () {
    try {
        DB::transaction(fn () => DB::table('institutions')->insert(institutionPayload(['is_active' => null])));
        $this->fail('PostgreSQL accepted null for is_active.');
    } catch (QueryException $exception) {
        expect((string) $exception->getCode())->toBe('23502');
    }

    $this->assertDatabaseCount('institutions', 0);
});

it('accepts a missing name, CCT or contact email but never a blank one directly in PostgreSQL (HU-S16-05)', function (string $field) {
    DB::table('institutions')->insert(institutionPayload([$field => null, 'cct' => $field === 'cct' ? null : '09DIT0001A']));
    try {
        DB::transaction(fn () => DB::table('institutions')->insert(institutionPayload([$field => '   ', 'cct' => $field === 'cct' ? '   ' : '09DIT0002B'])));
        $this->fail('PostgreSQL accepted a blank '.$field.'.');
    } catch (QueryException $exception) {
        expect((string) $exception->getCode())->toBe('23514');
    }

    $this->assertDatabaseCount('institutions', 1);
})->with(['name', 'cct', 'contact_email']);

it('defaults institutions to active directly in PostgreSQL', function () {
    $id = DB::table('institutions')->insertGetId(institutionPayload());

    expect(Institution::findOrFail($id)->is_active)->toBeTrue();
    $this->assertDatabaseHas('institutions', ['id' => $id, 'is_active' => true]);
});

describe('invitación de la institución (HU-S16-06)', function () {
    it('creates the account with the email as provisional name, sends the setup link and records institution_invited', function () {
        Notification::fake();
        $admin = User::factory()->role(UserRole::ADMIN)->create();
        $this->loginWithCookies($admin)->assertOk();

        $id = $this->browserRequest('POST', '/api/institutions', institutionInvite(['email' => '  Contacto@Example.TEST ', 'name' => '  ', 'person_name' => '']))
            ->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.name', null)
            ->assertJsonPath('setup_delivery', 'sent')
            ->assertJsonMissingPath('setup_url')
            ->json('data.id');

        $account = User::query()->where('email', 'contacto@example.test')->sole();
        expect($account->role)->toBe(UserRole::INSTITUTION)
            ->and($account->institution_id)->toBe($id)
            // M3: sin nombre de la persona, la cuenta guarda el correo como nombre provisional.
            ->and($account->name)->toBe('contacto@example.test')
            ->and($account->is_active)->toBeTrue()
            ->and($account->password_setup_required)->toBeTrue()
            ->and($account->created_by)->toBe($admin->id);
        Notification::assertSentTo($account, SetInitialPassword::class);
        Notification::assertCount(1);
        $this->assertDatabaseHas('account_audit_events', [
            'actor_id' => $admin->id, 'actor_kind' => 'user', 'event' => 'institution_invited', 'subject_type' => 'institution', 'subject_id' => $id,
        ]);
        // La bitácora la nombra con el respaldo mientras no captura su nombre (HU-S16-05).
        $this->browserRequest('GET', '/api/audit-events?type=institution_invited')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.actor.id', $admin->id)
            ->assertJsonPath('data.0.resource', ['subject_type' => 'institution', 'id' => $id, 'name' => 'Institución sin nombre', 'fields' => []]);
    });

    it('keeps the reference name and the person name, but leaves the contact for the onboarding (D5)', function () {
        Notification::fake();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $id = $this->browserRequest('POST', '/api/institutions', institutionInvite(['name' => ' UT del Golfo ', 'person_name' => ' Luis Pérez ']))
            ->assertCreated()
            ->assertJsonPath('data.name', 'UT del Golfo')
            ->assertJsonPath('data.contact_name', null)
            ->assertJsonPath('data.contact_email', null)
            ->json('data.id');

        expect(User::query()->where('institution_id', $id)->sole()->name)->toBe('Luis Pérez')
            ->and(Institution::findOrFail($id)->missing())->toBe(['cct', 'contact_name', 'contact_email']);
    });

    it('registers nothing when the email already belongs to an account, ignoring case', function () {
        Notification::fake();
        User::factory()->role(UserRole::SECRETARY)->create(['email' => 'contacto@example.test']);
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $this->browserRequest('POST', '/api/institutions', institutionInvite(['email' => 'CONTACTO@example.test']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => 'El correo ya está registrado en otra cuenta.']);

        $this->assertDatabaseCount('institutions', 0);
        $this->assertDatabaseMissing('account_audit_events', ['event' => 'institution_invited']);
        Notification::assertNothingSent();
    });

    it('rolls the institution and its audit event back when the email is taken after validation', function () {
        Notification::fake();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
        $dispatcher = Institution::getEventDispatcher();
        Institution::setEventDispatcher(clone $dispatcher);

        try {
            // El FormRequest ya pasó: solo la restricción de la base puede detectar este choque.
            Institution::created(fn () => User::factory()->create(['email' => 'contacto@example.test']));
            $this->browserRequest('POST', '/api/institutions', institutionInvite())
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['email' => 'El correo ya está registrado en otra cuenta.']);
        } finally {
            Institution::setEventDispatcher($dispatcher);
        }

        $this->assertDatabaseCount('institutions', 0);
        $this->assertDatabaseMissing('account_audit_events', ['event' => 'institution_invited']);
        Notification::assertNothingSent();
    });

    it('returns the setup link to share instead of emailing it with manual delivery (HU-S2-01)', function () {
        Notification::fake();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $response = $this->browserRequest('POST', '/api/institutions', institutionInvite(['delivery_method' => 'manual']))
            ->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('setup_delivery', 'manual')
            ->assertJsonMissingPath('data.delivery_method');

        expect($response->json('setup_url'))->toStartWith(rtrim(config('app.frontend_url'), '/').'/set-initial-password?');
        expect(User::query()->where('email', 'contacto@example.test')->sole()->password_setup_required)->toBeTrue();
        Notification::assertNothingSent();
    });

    it('validates the delivery method and never sends links when editing', function () {
        $institution = Institution::factory()->create();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $this->browserRequest('POST', '/api/institutions', institutionInvite(['delivery_method' => 'whatsapp']))
            ->assertUnprocessable()->assertJsonValidationErrors(['delivery_method' => 'El método de entrega debe ser email o manual.']);
        $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload(['delivery_method' => 'manual']))
            ->assertUnprocessable()->assertJsonValidationErrors(['delivery_method' => 'Editar la institución no envía enlaces: usa “Reenviar enlace”.']);
        $this->assertDatabaseCount('institutions', 1);
    });

    it('keeps the account email and name when the administrator edits the contact', function () {
        Notification::fake();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
        $id = $this->browserRequest('POST', '/api/institutions', institutionInvite(['person_name' => 'María Fernanda López']))->assertCreated()->json('data.id');

        $this->browserRequest('PUT', '/api/institutions/'.$id, institutionPayload(['contact_name' => 'Luis Pérez', 'contact_email' => 'nuevo@example.test']))
            ->assertOk()->assertJsonPath('data.contact_email', 'nuevo@example.test')->assertJsonPath('data.contact_name', 'Luis Pérez');
        $account = User::query()->where('institution_id', $id)->sole();
        expect($account->email)->toBe('contacto@example.test')->and($account->name)->toBe('María Fernanda López');
    });
});

describe('teléfono de la institución (T-S8-11)', function () {
    it('saves an optional phone when editing and clears it with a blank value', function () {
        $institution = Institution::factory()->create();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload(['contact_phone' => '+52 834 318 1800']))
            ->assertOk()->assertJsonPath('data.contact_phone', '+52 834 318 1800');
        $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload(['contact_phone' => '']))
            ->assertOk()->assertJsonPath('data.contact_phone', null);
    });

    it('rejects an invalid phone when editing', function (mixed $phone, string $message) {
        $institution = Institution::factory()->create();
        $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

        $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload(['contact_phone' => $phone]))
            ->assertUnprocessable()->assertJsonValidationErrors(['contact_phone' => $message]);
        $this->assertDatabaseCount('institutions', 1);
    })->with([
        'letters' => ['834-ABC-1234', 'El teléfono solo admite dígitos, espacios, paréntesis, guiones y un “+” inicial.'],
        'too few digits' => ['834 123', 'El teléfono debe tener entre 10 y 15 dígitos.'],
        'too many digits' => ['1234567890123456', 'El teléfono debe tener entre 10 y 15 dígitos.'],
        'too long' => [str_repeat('1 ', 11), 'El teléfono no debe superar 20 caracteres.'],
        'array' => [['8341234567'], 'El teléfono no es válido.'],
    ]);
});
