<?php

use App\Enums\UserRole;
use App\Enums\VideoStatus;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use App\Models\User;
use App\Support\ContactInformation;
use App\Support\Video\MediaUrl;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\InteractsWithCookieSessions;

// HU-S9-02: listado, edición y baja lógica de los videos propios, y archivos servidos con URL firmada.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

/** Video de una institución; si está listo, con su MP4 y su póster en el disco de medios. */
function managedVideo(Institution $institution, array $attributes = [], VideoStatus $status = VideoStatus::READY): InstitutionVideo
{
    $video = new InstitutionVideo(['title' => $attributes['title'] ?? 'Talleres', 'description' => $attributes['description'] ?? null]);
    $video->forceFill(array_replace([
        'public_id' => (string) Str::uuid(),
        'institution_id' => $institution->id,
        'created_by' => User::factory()->forInstitution($institution)->create()->id,
        'status' => $status,
        'original_bytes' => 136 * 1024 * 1024,
        'consent_confirmed_at' => now(),
    ], array_diff_key($attributes, ['title' => true, 'description' => true])));
    if ($status === VideoStatus::READY) {
        $base = 'videos/'.$institution->id.'/'.$video->public_id;
        Storage::disk('media')->put($base.'.mp4', str_repeat('m', 4096));
        Storage::disk('media')->put($base.'.jpg', 'jpg');
        $video->forceFill(['video_path' => $base.'.mp4', 'poster_path' => $base.'.jpg', 'duration_seconds' => 92, 'width' => 1280, 'height' => 720, 'output_bytes' => 4096]);
    }
    if ($status === VideoStatus::FAILED) {
        $video->failure_reason = 'El archivo no contiene una pista de video.';
    }
    $video->save();

    return $video;
}

function videoUrl(InstitutionVideo|string $video, string $suffix = ''): string
{
    return '/api/institution/videos/'.($video instanceof InstitutionVideo ? $video->public_id : $video).$suffix;
}

beforeEach(function () {
    Storage::fake('media');
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->foreign = managedVideo(Institution::factory()->create(), ['title' => 'Video ajeno']);
});

describe('acceso', function () {
    it('rejects visitors and other roles', function () {
        $video = managedVideo($this->institution);
        $this->startCookieSession();
        $this->browserRequest('GET', '/api/institution/videos')->assertUnauthorized();
        $this->browserRequest('PUT', videoUrl($video), ['title' => 'Otro'])->assertUnauthorized();
        $this->browserRequest('PATCH', videoUrl($video, '/status'), ['is_active' => false])->assertUnauthorized();

        foreach ([UserRole::ADMIN, UserRole::SECRETARY] as $role) {
            $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
            $this->browserRequest('GET', '/api/institution/videos')->assertForbidden();
            $this->browserRequest('PUT', videoUrl($video), ['title' => 'Otro'])->assertForbidden();
            $this->browserRequest('PATCH', videoUrl($video, '/status'), ['is_active' => false])->assertForbidden();
        }
        expect($video->refresh()->title)->toBe('Talleres')->and($video->is_active)->toBeTrue();
    });
});

describe('listado (CA-01)', function () {
    it('lists only its own videos, newest first, with the explicit fields', function () {
        $this->travelTo(now()->subDays(3));
        $failed = managedVideo($this->institution, ['title' => 'Fallido'], VideoStatus::FAILED);
        $this->travelBack();
        $this->travelTo(now()->subDay());
        $ready = managedVideo($this->institution, ['title' => 'Publicado']);
        $this->travelBack();
        $processing = managedVideo($this->institution, ['title' => 'En proceso'], VideoStatus::PROCESSING);
        $this->loginWithCookies($this->account)->assertOk();

        $response = $this->browserRequest('GET', '/api/institution/videos')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');

        expect(collect($response->json('data'))->pluck('title')->all())->toBe(['En proceso', 'Publicado', 'Fallido'])
            ->and(array_keys($response->json('data.0')))->toBe([
                'public_id', 'title', 'description', 'status', 'is_active', 'duration_seconds', 'width', 'height',
                'failure_reason', 'created_at', 'poster_url', 'video_url',
            ]);
        $response->assertJsonPath('data.1.status', 'READY')
            ->assertJsonPath('data.1.duration_seconds', 92)
            ->assertJsonMissingPath('data.1.output_bytes')
            ->assertJsonPath('data.2.failure_reason', 'El archivo no contiene una pista de video.')
            ->assertJsonPath('data.0.poster_url', null)
            ->assertJsonPath('data.2.video_url', null);
        // Las URLs son firmadas y relativas, nunca la ruta interna sola.
        expect($response->json('data.1.video_url'))->toStartWith('/api/media/'.$ready->video_path.'?expires=')->toContain('signature=')
            ->and($response->json('data.1.poster_url'))->toStartWith('/api/media/'.$ready->poster_path.'?expires=');
        expect($response->getContent())->not->toContain('"id"')->not->toContain('"source_path"');
        unset($failed, $processing);
    });

    it('keeps the same signed URL within the hour so polling does not reload the posters', function () {
        $this->travelTo(now()->startOfHour()->addMinutes(5));
        $video = managedVideo($this->institution);
        $first = MediaUrl::temporary($video->poster_path);

        $this->travelTo(now()->addMinutes(40));
        expect(MediaUrl::temporary($video->poster_path))->toBe($first);
    });

    it('presigns the URLs directly on S3 when the media disk is S3', function () {
        config([
            'filesystems.media_disk' => 's3',
            'filesystems.disks.s3' => ['driver' => 's3', 'key' => 'test', 'secret' => 'test', 'region' => 'us-east-1', 'bucket' => 'banco-talentos-media'],
        ]);

        expect(MediaUrl::temporary('videos/1/video.mp4'))
            ->toStartWith('https://banco-talentos-media.s3.amazonaws.com/videos/1/video.mp4?')
            ->toContain('X-Amz-Signature=');
    });
});

describe('archivos firmados (CA-06)', function () {
    it('serves the video with its type and byte ranges for the player', function () {
        $video = managedVideo($this->institution);
        $url = MediaUrl::temporary($video->video_path);

        $this->get($url)->assertOk()
            ->assertHeader('Content-Type', 'video/mp4')
            ->assertHeader('Accept-Ranges', 'bytes')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->get($url, ['Range' => 'bytes=0-99'])->assertStatus(206)->assertHeader('Content-Range', 'bytes 0-99/4096');
        $this->get(MediaUrl::temporary($video->poster_path))->assertOk()->assertHeader('Content-Type', 'image/jpeg');
    });

    it('rejects an altered or expired signature and unknown files', function () {
        $video = managedVideo($this->institution);
        $url = MediaUrl::temporary($video->video_path);

        $this->get($url.'0')->assertForbidden();
        $this->get('/api/media/'.$video->video_path)->assertForbidden();
        $this->get(str_replace($video->public_id, $this->foreign->public_id, $url))->assertForbidden();

        $missing = 'videos/'.$this->institution->id.'/'.Str::uuid().'.mp4';
        $this->get(MediaUrl::temporary($missing))->assertNotFound();

        $this->travelTo(now()->addHours(3));
        $this->get($url)->assertForbidden();
    });
});

describe('edición (CA-02)', function () {
    it('changes only the title and description', function () {
        $video = managedVideo($this->institution, ['description' => 'Antes']);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PUT', videoUrl($video), ['title' => 'Robótica 2026', 'description' => '', 'status' => 'FAILED', 'is_active' => false])
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.title', 'Robótica 2026')
            ->assertJsonPath('data.description', null)
            ->assertJsonPath('data.status', 'READY')
            ->assertJsonPath('data.is_active', true);

        expect($video->refresh()->title)->toBe('Robótica 2026')->and($video->description)->toBeNull();
    });

    it('validates like the upload', function (array $body, string $field, string $message) {
        $video = managedVideo($this->institution);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PUT', videoUrl($video), $body)->assertStatus(422)->assertJsonPath("errors.{$field}.0", $message);
        expect($video->refresh()->title)->toBe('Talleres');
    })->with([
        'sin título' => [['title' => ''], 'title', 'El título es obligatorio.'],
        'título largo' => [['title' => str_repeat('a', 121)], 'title', 'El título no debe superar 120 caracteres.'],
        'contacto' => [['title' => 'Llama al 55 1234 5678'], 'title', ContactInformation::VIDEO_MESSAGE],
        'descripción larga' => [['title' => 'Ok', 'description' => str_repeat('a', 1001)], 'description', 'La descripción no debe superar 1000 caracteres.'],
    ]);
});

describe('baja lógica (CA-03)', function () {
    it('deactivates and reactivates a video, and repeating the same state does not fail', function () {
        $video = managedVideo($this->institution);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($video, '/status'), ['is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
        $this->browserRequest('PATCH', videoUrl($video, '/status'), ['is_active' => false])->assertOk();
        $this->browserRequest('PATCH', videoUrl($video, '/status'), ['is_active' => true])->assertOk()->assertJsonPath('data.is_active', true);

        // Baja lógica: los archivos se conservan.
        Storage::disk('media')->assertExists([$video->video_path, $video->poster_path]);
    });

    it('respects the quota of 5 active videos when reactivating', function () {
        $inactive = managedVideo($this->institution, ['is_active' => false]);
        foreach (range(1, 5) as $i) {
            managedVideo($this->institution);
        }
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($inactive, '/status'), ['is_active' => true])
            ->assertStatus(422)
            ->assertJsonPath('errors.is_active.0', 'Tu institución ya tiene 5 videos activos.');
        expect($inactive->refresh()->is_active)->toBeFalse();

        // Un video fallido no ocupa lugar: reactivarlo no rebasa la cuota.
        $failed = managedVideo($this->institution, ['is_active' => false], VideoStatus::FAILED);
        $this->browserRequest('PATCH', videoUrl($failed, '/status'), ['is_active' => true])->assertOk();
    });

    it('accepts only a strict is_active', function (array $body, string $field) {
        $video = managedVideo($this->institution);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($video, '/status'), $body)->assertStatus(422)->assertJsonValidationErrors($field);
        expect($video->refresh()->is_active)->toBeTrue();
    })->with([
        'sin estado' => [[], 'is_active'],
        'texto' => [['is_active' => 'false'], 'is_active'],
        'número' => [['is_active' => 0], 'is_active'],
        'otro campo' => [['is_active' => false, 'title' => 'Otro'], 'title'],
    ]);
});

describe('eliminación (T-S9-04)', function () {
    it('deletes the files of a ready or failed video and keeps a hidden record of who deleted it', function (bool $active, VideoStatus $status) {
        $video = managedVideo($this->institution, ['is_active' => $active], $status);
        $files = array_filter([$video->video_path, $video->poster_path]);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($video, '/deletion'))->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');

        foreach ($files as $file) {
            Storage::disk('media')->assertMissing($file);
        }
        $record = InstitutionVideo::withTrashed()->find($video->id);
        expect($record->trashed())->toBeTrue()
            ->and($record->deleted_by)->toBe($this->account->id)
            ->and($record->video_path)->toBeNull()
            ->and($record->poster_path)->toBeNull()
            ->and($record->is_active)->toBeFalse()
            ->and($record->title)->toBe('Talleres')
            ->and($record->consent_confirmed_at)->not->toBeNull();
        $this->browserRequest('GET', '/api/institution/videos')->assertOk()->assertExactJson(['data' => []]);
    })->with([
        'listo y activo' => [true, VideoStatus::READY],
        'listo e inactivo' => [false, VideoStatus::READY],
        'fallido' => [false, VideoStatus::FAILED],
    ]);

    it('frees a place in the quota of 5 active videos', function () {
        $videos = collect(range(1, 5))->map(fn () => managedVideo($this->institution));
        $inactive = managedVideo($this->institution, ['is_active' => false]);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($inactive, '/status'), ['is_active' => true])->assertStatus(422);
        $this->browserRequest('PATCH', videoUrl($videos->first(), '/deletion'))->assertNoContent();
        $this->browserRequest('PATCH', videoUrl($inactive, '/status'), ['is_active' => true])->assertOk();
    });

    it('does not delete a video that is still processing', function () {
        $video = managedVideo($this->institution, [], VideoStatus::PROCESSING);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($video, '/deletion'))
            ->assertStatus(422)->assertJsonPath('errors.video.0', 'Espera a que termine de procesarse para eliminarlo.');
        expect(InstitutionVideo::find($video->id))->not->toBeNull();
    });

    it('answers 404 for a foreign, unknown, malformed or already deleted video, and 403 for other roles', function () {
        $video = managedVideo($this->institution);
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('PATCH', videoUrl($this->foreign, '/deletion'))->assertNotFound();
        $this->browserRequest('PATCH', videoUrl((string) Str::uuid(), '/deletion'))->assertNotFound();
        $this->browserRequest('PATCH', videoUrl('no-es-uuid', '/deletion'))->assertNotFound();
        $this->browserRequest('PATCH', videoUrl($video, '/deletion'))->assertNoContent();
        $this->browserRequest('PATCH', videoUrl($video, '/deletion'))->assertNotFound();
        $this->browserRequest('PATCH', videoUrl($video, '/status'), ['is_active' => true])->assertNotFound();
        Storage::disk('media')->assertExists($this->foreign->video_path);

        $other = managedVideo($this->institution);
        foreach ([UserRole::ADMIN, UserRole::SECRETARY, UserRole::COMPANY] as $role) {
            $user = $role === UserRole::COMPANY ? User::factory()->forCompany()->create() : User::factory()->role($role)->create();
            $this->loginWithCookies($user)->assertOk();
            $this->browserRequest('PATCH', videoUrl($other, '/deletion'))->assertForbidden();
        }
        expect(InstitutionVideo::find($other->id))->not->toBeNull();
    });

    it('rejects a deleted video that keeps its files in the database', function () {
        $video = managedVideo($this->institution);

        expect(fn () => DB::table('institution_videos')->where('id', $video->id)->update(['deleted_at' => now(), 'deleted_by' => $this->account->id, 'is_active' => false]))
            ->toThrow(QueryException::class, 'institution_videos_deleted_check');
    });
});

describe('anti-IDOR (CA-04)', function () {
    it('answers the same 404 for a foreign, unknown or malformed video', function (string $method, string $suffix, array $body) {
        $this->loginWithCookies($this->account)->assertOk();

        $foreign = $this->browserRequest($method, videoUrl($this->foreign, $suffix), $body)->assertNotFound();
        $unknown = $this->browserRequest($method, videoUrl((string) Str::uuid(), $suffix), $body)->assertNotFound();
        $this->browserRequest($method, videoUrl('1', $suffix), $body)->assertNotFound();
        $this->browserRequest($method, videoUrl('no-es-uuid', $suffix), $body)->assertNotFound();

        expect($foreign->json())->toBe($unknown->json());
        expect($this->foreign->refresh()->title)->toBe('Video ajeno')->and($this->foreign->is_active)->toBeTrue();
    })->with([
        'edición' => ['PUT', '', ['title' => 'Tomado']],
        'estado' => ['PATCH', '/status', ['is_active' => false]],
    ]);

    it('never lists the videos of another institution', function () {
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('GET', '/api/institution/videos')->assertOk()->assertExactJson(['data' => []]);
    });
});
