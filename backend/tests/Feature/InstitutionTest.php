<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        'contact_email' => 'contacto@example.test',
    ], $overrides);
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

dataset('invalid institution fields', [
    'missing fields' => [[], ['name', 'cct', 'contact_email']],
    'missing name' => [['cct' => '09DIT0001A', 'contact_email' => 'contacto@example.test'], ['name']],
    'missing cct' => [['name' => 'Instituto', 'contact_email' => 'contacto@example.test'], ['cct']],
    'missing contact email' => [['name' => 'Instituto', 'cct' => '09DIT0001A'], ['contact_email']],
    'null name' => [institutionPayload(['name' => null]), ['name']],
    'blank name' => [institutionPayload(['name' => '   ']), ['name']],
    'non-string name' => [institutionPayload(['name' => ['invalid']]), ['name']],
    'long name' => [institutionPayload(['name' => str_repeat('n', 256)]), ['name']],
    'null cct' => [institutionPayload(['cct' => null]), ['cct']],
    'blank cct' => [institutionPayload(['cct' => '']), ['cct']],
    'numeric cct' => [institutionPayload(['cct' => 12345]), ['cct']],
    'long cct' => [institutionPayload(['cct' => str_repeat('c', 256)]), ['cct']],
    'null contact email' => [institutionPayload(['contact_email' => null]), ['contact_email']],
    'blank contact email' => [institutionPayload(['contact_email' => '']), ['contact_email']],
    'non-string contact email' => [institutionPayload(['contact_email' => ['invalid']]), ['contact_email']],
    'malformed contact email' => [institutionPayload(['contact_email' => 'not-an-email']), ['contact_email']],
    'long contact email' => [institutionPayload([
        'contact_email' => str_repeat('a', 64).'@'.str_repeat('b', 62).'.'.str_repeat('c', 62).'.'.str_repeat('d', 59).'.test',
    ]), ['contact_email']],
]);

it('allows an administrator to list every institution including inactive ones in id order', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $this->browserRequest('GET', '/api/institutions')->assertOk()->assertExactJson(['data' => []]);
    $first = Institution::factory()->inactive()->create(['name' => 'Zeta']);
    $second = Institution::factory()->create(['name' => 'Alfa']);

    $this->browserRequest('GET', '/api/institutions')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.id', $first->id)
        ->assertJsonPath('data.0.is_active', false)
        ->assertJsonPath('data.1.id', $second->id)
        ->assertJsonPath('data.1.is_active', true);
});

it('allows an administrator to create an institution with its default active state', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $response = $this->browserRequest('POST', '/api/institutions', institutionPayload())
        ->assertCreated()
        ->assertJsonPath('data.name', 'Instituto de Educación Dual')
        ->assertJsonPath('data.cct', '09DIT0001A')
        ->assertJsonPath('data.contact_email', 'contacto@example.test')
        ->assertJsonPath('data.is_active', true);

    $this->assertDatabaseCount('institutions', 1);
    $this->assertDatabaseHas('institutions', institutionPayload([
        'id' => $response->json('data.id'),
        'is_active' => true,
    ]));
    expect(Institution::sole()->is_active)->toBeTrue();
});

it('accepts field values at their supported length limits', function () {
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $payload = institutionPayload([
        'name' => str_repeat('n', 255),
        'cct' => str_repeat('c', 255),
        'contact_email' => str_repeat('a', 64).'@'.str_repeat('b', 62).'.'.str_repeat('c', 62).'.'.str_repeat('d', 58).'.test',
    ]);

    $this->browserRequest('POST', '/api/institutions', $payload)->assertCreated();

    $this->assertDatabaseHas('institutions', $payload);
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
    $this->assertDatabaseHas('institutions', array_replace($payload, ['id' => $institution->id, 'is_active' => false]));
});

it('rejects invalid institution creation without inserting a partial record', function (array $payload, array $fields) {
    $existing = Institution::factory()->create();
    $original = $existing->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institutions', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($fields);

    $this->assertDatabaseCount('institutions', 1);
    expect($existing->fresh()->getAttributes())->toBe($original);
})->with('invalid institution fields');

it('rejects invalid full updates without persisting any changed field', function (array $payload, array $fields) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($fields);

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
})->with('invalid institution fields');

it('rejects a cct already used by an active or inactive institution on creation and update', function (bool $active) {
    $existing = Institution::factory()->create(['cct' => '09DIT0001A', 'is_active' => $active]);
    $target = Institution::factory()->create();
    $originalExisting = $existing->refresh()->getAttributes();
    $originalTarget = $target->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    foreach ([['POST', '/api/institutions'], ['PUT', '/api/institutions/'.$target->id]] as [$method, $uri]) {
        $this->browserRequest($method, $uri, institutionPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cct');

        $this->assertDatabaseCount('institutions', 2);
        expect($existing->fresh()->getAttributes())->toBe($originalExisting);
        expect($target->fresh()->getAttributes())->toBe($originalTarget);
    }
})->with(['active' => [true], 'inactive' => [false]]);

it('allows an update to retain the institutions own cct', function () {
    $institution = Institution::factory()->create(['cct' => '09DIT0001A']);
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('PUT', '/api/institutions/'.$institution->id, institutionPayload())
        ->assertOk()
        ->assertJsonPath('data.cct', '09DIT0001A');

    $this->assertDatabaseHas('institutions', institutionPayload(['id' => $institution->id]));
});

it('returns a validation error and rolls back when a cct becomes occupied after request validation', function (string $method) {
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

        if ($method === 'POST') {
            Institution::creating($occupyCct);
        } else {
            Institution::updating($occupyCct);
        }

        $uri = '/api/institutions'.($method === 'PUT' ? '/'.$institution->id : '');
        $this->browserRequest($method, $uri, institutionPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cct');
    } finally {
        Institution::setEventDispatcher($dispatcher);
    }

    $this->assertDatabaseCount('institutions', 1);
    expect($institution->fresh()->getAttributes())->toBe($original);
    $this->assertDatabaseMissing('institutions', ['cct' => '09DIT0001A']);
})->with(['POST', 'PUT']);

it('applies exact cct uniqueness without normalizing case or making names and emails unique', function () {
    Institution::factory()->create(institutionPayload(['cct' => 'Exact-Cct']));
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();

    $this->browserRequest('POST', '/api/institutions', institutionPayload(['cct' => 'exact-cct']))
        ->assertCreated()
        ->assertJsonPath('data.cct', 'exact-cct');

    $this->assertDatabaseCount('institutions', 2);
    $this->assertDatabaseHas('institutions', ['cct' => 'Exact-Cct']);
    $this->assertDatabaseHas('institutions', ['cct' => 'exact-cct']);
});

it('only permits status changes through the dedicated action', function (string $method, mixed $state) {
    $institution = Institution::factory()->create();
    $original = $institution->refresh()->getAttributes();
    $this->loginWithCookies(User::factory()->role(UserRole::ADMIN)->create())->assertOk();
    $uri = '/api/institutions'.($method === 'PUT' ? '/'.$institution->id : '');

    $this->browserRequest($method, $uri, institutionPayload(['is_active' => $state]))
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
    $response = $this->browserRequest('POST', '/api/institutions', institutionPayload($extra))->assertCreated();
    $institution = Institution::findOrFail($response->json('data.id'));
    $createdAt = $institution->getRawOriginal('created_at');

    expect($institution->id)->not->toBe($extra['id']);
    expect($createdAt)->not->toBe($extra['created_at']);

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
    $payload = $method === 'PATCH' ? ['is_active' => false] : institutionPayload();

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
    $payload = $method === 'PATCH' ? ['is_active' => false] : institutionPayload();
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
    $payload = $method === 'PATCH' ? ['is_active' => false] : institutionPayload();

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
    $payload = $method === 'PATCH' ? ['is_active' => false] : institutionPayload();

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
    $payload = $method === 'PATCH' ? ['is_active' => false] : institutionPayload();

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

it('enforces non-null institution fields directly in PostgreSQL', function (string $field) {
    try {
        DB::transaction(fn () => DB::table('institutions')->insert(institutionPayload([$field => null])));
        $this->fail('PostgreSQL accepted null for the required institution field '.$field.'.');
    } catch (QueryException $exception) {
        expect((string) $exception->getCode())->toBe('23502');
    }

    $this->assertDatabaseCount('institutions', 0);
})->with(['name', 'cct', 'contact_email', 'is_active']);

it('defaults institutions to active directly in PostgreSQL', function () {
    $id = DB::table('institutions')->insertGetId(institutionPayload());

    expect(Institution::findOrFail($id)->is_active)->toBeTrue();
    $this->assertDatabaseHas('institutions', ['id' => $id, 'is_active' => true]);
});
