<?php

use App\Enums\UserRole;
use App\Enums\VideoStatus;
use App\Jobs\ProcessInstitutionVideo;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use App\Models\User;
use App\Support\ContactInformation;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\InteractsWithCookieSessions;

// HU-S9-01: subida del video promocional por la institución. El procesamiento se prueba en ProcessInstitutionVideoTest.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

const VIDEOS_URL = '/api/institution/videos';

function videoUpload(string $name = 'promocion.mp4', int $kilobytes = 2048, string $mime = 'video/mp4'): UploadedFile
{
    return UploadedFile::fake()->create($name, $kilobytes, $mime);
}

function videoFields(array $overrides = []): array
{
    return array_replace([
        'title' => 'Talleres de manufactura',
        'description' => 'Conoce los talleres donde nuestros alumnos aprenden en la empresa.',
        'consent' => '1',
    ], $overrides);
}

/** Video ya registrado de una institución, en el estado indicado (para la cuota). */
function existingVideo(Institution $institution, VideoStatus $status = VideoStatus::READY, bool $active = true): InstitutionVideo
{
    $video = new InstitutionVideo(['title' => 'Video existente']);
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
        $video->forceFill(['video_path' => 'v.mp4', 'poster_path' => 'v.jpg', 'duration_seconds' => 60, 'width' => 1280, 'height' => 720, 'output_bytes' => 512]);
    }
    if ($status === VideoStatus::FAILED) {
        $video->failure_reason = 'Motivo';
    }
    $video->save();

    return $video;
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('media');
    Queue::fake();
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
});

function uploadVideo($test, array $fields = [], ?UploadedFile $file = null)
{
    return $test->browserRequest('POST', VIDEOS_URL, videoFields($fields), files: $file === null ? [] : ['video' => $file]);
}

describe('acceso (CA-06)', function () {
    it('rejects visitors', function () {
        $this->startCookieSession();

        uploadVideo($this, file: videoUpload())->assertUnauthorized();
        expect(InstitutionVideo::query()->count())->toBe(0);
    });

    it('forbids every other role', function (UserRole $role) {
        $user = $role === UserRole::COMPANY ? User::factory()->forCompany()->create() : User::factory()->role($role)->create();
        $this->loginWithCookies($user)->assertOk();

        uploadVideo($this, file: videoUpload())->assertForbidden();
        expect(InstitutionVideo::query()->count())->toBe(0);
    })->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

    it('rejects the accounts of an inactive institution with INSTITUTION_INACTIVE', function () {
        $this->loginWithCookies($this->account)->assertOk();
        $this->institution->forceFill(['is_active' => false])->save();

        uploadVideo($this, file: videoUpload())->assertUnauthorized()->assertJsonPath('code', 'INSTITUTION_INACTIVE');
    });

    it('requires CSRF', function () {
        $this->loginWithCookies($this->account)->assertOk();

        $this->browserRequest('POST', VIDEOS_URL, videoFields(), csrf: false, files: ['video' => videoUpload()])->assertStatus(419);
        expect(InstitutionVideo::query()->count())->toBe(0);
    });
});

describe('subida (CA-01, CA-02, CA-04)', function () {
    it('keeps the original privately, answers 202 PROCESSING and queues the processing on the videos queue', function () {
        $this->loginWithCookies($this->account)->assertOk();

        $response = uploadVideo($this, ['institution_id' => Institution::factory()->create()->id, 'status' => 'READY'], videoUpload(kilobytes: 4096))
            ->assertStatus(202)
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.status', 'PROCESSING')
            ->assertJsonPath('data.title', 'Talleres de manufactura')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.original_bytes', 4096 * 1024)
            ->assertJsonPath('data.output_bytes', null);

        // Solo los campos del contrato: sin id interno ni rutas.
        expect(array_keys($response->json('data')))->toBe([
            'public_id', 'title', 'description', 'status', 'is_active', 'duration_seconds', 'width', 'height',
            'original_bytes', 'output_bytes', 'failure_reason', 'created_at',
        ]);

        $video = InstitutionVideo::query()->sole();
        expect($video->public_id)->toBe($response->json('data.public_id'))
            ->and($video->institution_id)->toBe($this->institution->id)
            ->and($video->created_by)->toBe($this->account->id)
            ->and($video->status)->toBe(VideoStatus::PROCESSING)
            ->and($video->consent_confirmed_at)->not->toBeNull()
            ->and($video->source_path)->toBe('videos/originals/'.$this->institution->id.'/'.$video->public_id.'.mp4');

        Storage::disk('local')->assertExists($video->source_path);
        expect(Storage::disk('media')->allFiles())->toBe([]);

        Queue::assertPushedOn('videos', ProcessInstitutionVideo::class, fn (ProcessInstitutionVideo $job): bool => $job->videoId === $video->id);
    });

    it('accepts MOV and WebM videos and an empty description', function (string $name, string $mime) {
        $this->loginWithCookies($this->account)->assertOk();

        uploadVideo($this, ['description' => ''], videoUpload($name, mime: $mime))->assertStatus(202)->assertJsonPath('data.description', null);
    })->with([['iphone.MOV', 'video/quicktime'], ['grabacion.webm', 'video/webm']]);

    it('validates the upload', function (array $fields, ?Closure $file, string $error, string $message) {
        $this->loginWithCookies($this->account)->assertOk();

        uploadVideo($this, $fields, $file?->__invoke())
            ->assertStatus(422)
            ->assertJsonPath("errors.{$error}.0", $message);

        expect(InstitutionVideo::query()->count())->toBe(0)
            ->and(Storage::disk('local')->allFiles())->toBe([]);
        Queue::assertNothingPushed();
    })->with([
        'sin video' => [[], null, 'video', 'Selecciona el video.'],
        'otra extensión' => [[], fn () => videoUpload('promocion.avi', mime: 'video/x-msvideo'), 'video', 'El video debe ser MP4, MOV o WebM.'],
        'extensión falsa' => [[], fn () => videoUpload('promocion.mp4', mime: 'application/pdf'), 'video', 'El video debe ser MP4, MOV o WebM.'],
        'más de 250 MB' => [[], fn () => videoUpload(kilobytes: 250 * 1024 + 1), 'video', 'El video no debe superar 250 MB.'],
        'sin título' => [['title' => ''], fn () => videoUpload(), 'title', 'El título es obligatorio.'],
        'título largo' => [['title' => str_repeat('a', 121)], fn () => videoUpload(), 'title', 'El título no debe superar 120 caracteres.'],
        'descripción larga' => [['description' => str_repeat('a', 1001)], fn () => videoUpload(), 'description', 'La descripción no debe superar 1000 caracteres.'],
        'contacto en el título' => [['title' => 'Escríbenos a promo@escuela.mx'], fn () => videoUpload(), 'title', ContactInformation::VIDEO_MESSAGE],
        'contacto en la descripción' => [['description' => 'Visita https://escuela.mx'], fn () => videoUpload(), 'description', ContactInformation::VIDEO_MESSAGE],
        'sin consentimiento' => [['consent' => null], fn () => videoUpload(), 'consent', 'Confirma que cuentas con la autorización de las personas que aparecen en el video.'],
        'consentimiento negado' => [['consent' => '0'], fn () => videoUpload(), 'consent', 'Confirma que cuentas con la autorización de las personas que aparecen en el video.'],
    ]);
});

describe('cuota (CA-03)', function () {
    it('rejects a sixth active video and discards its original', function () {
        foreach ([VideoStatus::READY, VideoStatus::READY, VideoStatus::READY, VideoStatus::PROCESSING, VideoStatus::PROCESSING] as $status) {
            existingVideo($this->institution, $status);
        }
        $this->loginWithCookies($this->account)->assertOk();

        uploadVideo($this, file: videoUpload())
            ->assertStatus(422)
            ->assertJsonPath('errors.video.0', 'Tu institución ya tiene 5 videos activos.');

        expect(InstitutionVideo::query()->count())->toBe(5)
            ->and(Storage::disk('local')->allFiles())->toBe([]);
        Queue::assertNothingPushed();
    });

    it('does not count failed or inactive videos, nor those of other institutions', function () {
        foreach (range(1, 4) as $i) {
            existingVideo($this->institution);
        }
        existingVideo($this->institution, VideoStatus::FAILED);
        existingVideo($this->institution, active: false);
        foreach (range(1, 5) as $i) {
            existingVideo(Institution::factory()->create());
        }
        $this->loginWithCookies($this->account)->assertOk();

        uploadVideo($this, file: videoUpload())->assertStatus(202);
        uploadVideo($this, file: videoUpload())->assertStatus(422);
    });

    it('locks the institution row while counting, so simultaneous uploads cannot exceed the quota', function () {
        $this->loginWithCookies($this->account)->assertOk();
        DB::enableQueryLog();

        uploadVideo($this, file: videoUpload())->assertStatus(202);

        $locked = collect(DB::getQueryLog())->pluck('query')
            ->contains(fn (string $query): bool => str_contains($query, 'from "institutions"') && str_contains($query, 'for update'));
        expect($locked)->toBeTrue();
    });
});

describe('restricciones en PostgreSQL (CA-01)', function () {
    it('rejects an unknown status, a READY video without its files and a FAILED video without a reason', function (array $attributes) {
        $video = existingVideo($this->institution, VideoStatus::PROCESSING);

        expect(fn () => DB::table('institution_videos')->where('id', $video->id)->update($attributes))
            ->toThrow(QueryException::class);
    })->with([
        'estado desconocido' => [['status' => 'PUBLISHED']],
        'listo sin archivos' => [['status' => 'READY']],
        'fallido sin motivo' => [['status' => 'FAILED']],
    ]);
});
