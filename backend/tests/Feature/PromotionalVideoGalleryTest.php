<?php

use App\Enums\UserRole;
use App\Enums\VideoStatus;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\InteractsWithCookieSessions;

// HU-S9-03: galería de promoción dual para empresas, Secretaría y Administrador, y moderación mínima del Administrador.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

/** Video de la galería; si está listo, con sus archivos en el disco de medios. */
function galleryVideo(Institution $institution, string $title, VideoStatus $status = VideoStatus::READY, bool $active = true): InstitutionVideo
{
    $video = new InstitutionVideo(['title' => $title, 'description' => 'Descripción de '.$title]);
    $video->forceFill([
        'public_id' => (string) Str::uuid(),
        'institution_id' => $institution->id,
        'created_by' => User::factory()->forInstitution($institution)->create()->id,
        'status' => $status,
        'is_active' => $active,
        'original_bytes' => 1024,
        'consent_confirmed_at' => now(),
    ]);
    if ($status === VideoStatus::READY) {
        $base = 'videos/'.$institution->id.'/'.$video->public_id;
        Storage::disk('media')->put($base.'.mp4', str_repeat('m', 2048));
        Storage::disk('media')->put($base.'.jpg', 'jpg');
        $video->forceFill(['video_path' => $base.'.mp4', 'poster_path' => $base.'.jpg', 'duration_seconds' => 75, 'width' => 1280, 'height' => 720, 'output_bytes' => 2048]);
    }
    if ($status === VideoStatus::FAILED) {
        $video->failure_reason = 'Motivo';
    }
    $video->save();

    return $video;
}

function signInToGallery($test, UserRole $role): User
{
    $user = $role === UserRole::COMPANY ? User::factory()->forCompany()->create() : User::factory()->role($role)->create();
    $test->loginWithCookies($user)->assertOk();

    return $user;
}

beforeEach(function () {
    Storage::fake('media');
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create(['name' => 'Instituto Tecnológico Dual']);
});

describe('acceso (CA-06)', function () {
    it('lets companies, the Secretariat and the Administrator browse the gallery', function (UserRole $role) {
        galleryVideo($this->institution, 'Talleres');
        signInToGallery($this, $role);

        $this->browserRequest('GET', '/api/promotional-videos')->assertOk()->assertJsonPath('meta.total', 1);
    })->with([UserRole::COMPANY, UserRole::SECRETARY, UserRole::ADMIN]);

    it('rejects visitors and institutions', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', '/api/promotional-videos')->assertUnauthorized();

        $this->loginWithCookies(User::factory()->forInstitution($this->institution)->create())->assertOk();
        $this->browserRequest('GET', '/api/promotional-videos')->assertForbidden();
    });
});

describe('galería (CA-01, CA-02)', function () {
    it('shows only ready, active videos of active institutions, newest first', function () {
        $inactiveInstitution = Institution::factory()->inactive()->create();
        $this->travelTo(now()->subDays(2));
        galleryVideo($this->institution, 'Antiguo');
        $this->travelBack();
        galleryVideo($this->institution, 'Reciente');
        galleryVideo($this->institution, 'En proceso', VideoStatus::PROCESSING);
        galleryVideo($this->institution, 'Fallido', VideoStatus::FAILED);
        galleryVideo($this->institution, 'Inactivo', active: false);
        galleryVideo($inactiveInstitution, 'De institución inactiva');
        signInToGallery($this, UserRole::COMPANY);

        $response = $this->browserRequest('GET', '/api/promotional-videos')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.per_page', 12);

        expect(collect($response->json('data'))->pluck('title')->all())->toBe(['Reciente', 'Antiguo']);
    });

    it('exposes only the explicit fields, with signed URLs', function () {
        $video = galleryVideo($this->institution, 'Talleres');
        signInToGallery($this, UserRole::COMPANY);

        $response = $this->browserRequest('GET', '/api/promotional-videos')->assertOk();
        $item = $response->json('data.0');

        expect(array_keys($item))->toBe(['public_id', 'title', 'description', 'duration_seconds', 'width', 'height', 'institution', 'poster_url', 'video_url'])
            ->and($item['institution'])->toBe(['public_id' => $this->institution->refresh()->public_id, 'name' => 'Instituto Tecnológico Dual'])
            ->and($item['duration_seconds'])->toBe(75)
            ->and([$item['width'], $item['height']])->toBe([1280, 720])
            ->and($item['video_url'])->toStartWith('/api/media/'.$video->video_path.'?expires=')->toContain('signature=');
        // Sin ids internos, rutas, estado de la cuota ni datos de quien lo subió.
        expect($response->getContent())->not->toContain('"id"')->not->toContain('institution_id')->not->toContain('created_by')
            ->not->toContain('source_path')->not->toContain('location')->not->toContain('original_bytes');
        $this->get($item['video_url'], ['Range' => 'bytes=0-9'])->assertStatus(206);
    });

    it('filters by institution public_id and paginates by 12', function () {
        $other = Institution::factory()->create();
        foreach (range(1, 13) as $i) {
            galleryVideo($this->institution, 'Video '.$i);
        }
        galleryVideo($other, 'De otra institución');
        signInToGallery($this, UserRole::SECRETARY);

        $this->browserRequest('GET', '/api/promotional-videos?page=2')->assertOk()
            ->assertJsonPath('meta.total', 14)->assertJsonPath('meta.last_page', 2)->assertJsonCount(2, 'data');
        $this->browserRequest('GET', '/api/promotional-videos?institution='.$other->refresh()->public_id)->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.title', 'De otra institución');
        $this->browserRequest('GET', '/api/promotional-videos?institution='.Str::uuid())->assertOk()->assertJsonPath('meta.total', 0);
    });

    it('validates the filters', function (string $query, string $field) {
        signInToGallery($this, UserRole::COMPANY);

        $this->browserRequest('GET', '/api/promotional-videos?'.$query)->assertStatus(422)->assertJsonValidationErrors($field);
    })->with([
        'institución numérica' => ['institution='.PHP_INT_MAX, 'institution'],
        'institución texto' => ['institution=itd', 'institution'],
        'página cero' => ['page=0', 'page'],
    ]);

    it('gives every institution a unique random public_id without exposing it to administration', function () {
        $first = Institution::factory()->create()->refresh();
        $second = Institution::factory()->create()->refresh();

        expect(Str::isUuid($first->public_id))->toBeTrue()->and($first->public_id)->not->toBe($second->public_id)
            ->and($first->toArray())->not->toHaveKey('public_id');
    });
});

describe('moderación del Administrador (CA-05)', function () {
    it('lets the Administrator deactivate a video, which leaves the gallery but stays inactive for the institution', function () {
        $video = galleryVideo($this->institution, 'Inapropiado');
        signInToGallery($this, UserRole::ADMIN);

        $this->browserRequest('PATCH', '/api/promotional-videos/'.$video->public_id.'/status', ['is_active' => false])
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => ['public_id' => $video->public_id, 'is_active' => false]]);
        $this->browserRequest('PATCH', '/api/promotional-videos/'.$video->public_id.'/status', ['is_active' => false])->assertOk();

        expect($video->refresh()->is_active)->toBeFalse()->and($video->status)->toBe(VideoStatus::READY);
        $this->browserRequest('GET', '/api/promotional-videos')->assertJsonPath('meta.total', 0);
        // Baja lógica: los archivos se conservan para que la institución pueda reactivarlo.
        Storage::disk('media')->assertExists($video->video_path);
    });

    it('does not let the Administrator reactivate a video or change anything else', function (array $body, string $field) {
        $video = galleryVideo($this->institution, 'Talleres', active: false);
        signInToGallery($this, UserRole::ADMIN);

        $this->browserRequest('PATCH', '/api/promotional-videos/'.$video->public_id.'/status', $body)
            ->assertStatus(422)->assertJsonValidationErrors($field);
        expect($video->refresh()->is_active)->toBeFalse();
    })->with([
        'reactivar' => [['is_active' => true], 'is_active'],
        'texto' => [['is_active' => 'false'], 'is_active'],
        'otro campo' => [['is_active' => false, 'title' => 'Otro'], 'title'],
    ]);

    it('forbids moderation to every other role', function (UserRole $role) {
        $video = galleryVideo($this->institution, 'Talleres');
        $user = $role === UserRole::INSTITUTION ? User::factory()->forInstitution($this->institution)->create()
            : ($role === UserRole::COMPANY ? User::factory()->forCompany()->create() : User::factory()->role($role)->create());
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('PATCH', '/api/promotional-videos/'.$video->public_id.'/status', ['is_active' => false])->assertForbidden();
        expect($video->refresh()->is_active)->toBeTrue();
    })->with([UserRole::COMPANY, UserRole::SECRETARY, UserRole::INSTITUTION]);

    it('answers 404 for an unknown or malformed video', function () {
        signInToGallery($this, UserRole::ADMIN);

        $this->browserRequest('PATCH', '/api/promotional-videos/'.Str::uuid().'/status', ['is_active' => false])->assertNotFound();
        $this->browserRequest('PATCH', '/api/promotional-videos/1/status', ['is_active' => false])->assertNotFound();
    });
});
