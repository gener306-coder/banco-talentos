<?php

use App\Enums\VideoStatus;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// T-S14-18: el comando genera la versión WebM de los videos listos que aún no la tienen.
uses(RefreshDatabase::class);

function readyVideo(array $attributes = []): InstitutionVideo
{
    $institution = Institution::factory()->create();
    $video = new InstitutionVideo(['title' => 'Talleres']);
    $video->forceFill(['public_id' => (string) Str::uuid(), 'institution_id' => $institution->id,
        'created_by' => User::factory()->forInstitution($institution)->create()->id, 'status' => VideoStatus::READY,
        'original_bytes' => 1024, 'consent_confirmed_at' => now()]);
    $base = 'videos/'.$institution->id.'/'.$video->public_id;
    Storage::disk('media')->put($base.'.mp4', str_repeat('m', 2048));
    Storage::disk('media')->put($base.'.jpg', 'jpg');
    $video->forceFill(['video_path' => $base.'.mp4', 'poster_path' => $base.'.jpg', 'duration_seconds' => 30, 'width' => 1280,
        'height' => 720, 'output_bytes' => 2048, ...$attributes])->save();

    return $video->refresh();
}

beforeEach(fn () => Storage::fake('media'));

it('converts the ready videos without WebM, skips the rest and keeps going after a failure', function () {
    $first = readyVideo();
    $broken = readyVideo();
    $done = readyVideo(['webm_path' => 'videos/0/ya.webm']);
    Process::fake(function (PendingProcess $process) use ($broken) {
        $command = $process->command;
        if (str_contains(implode(' ', $command), $broken->public_id)) {
            return Process::result(errorOutput: 'Invalid data', exitCode: 1);
        }
        file_put_contents(end($command), 'webm');

        return Process::result();
    });

    $this->artisan('videos:webm')->expectsOutputToContain('Videos con WebM nuevo: 1. Sin convertir: 1.')->assertSuccessful();

    $webm = preg_replace('/\.mp4$/', '.webm', $first->video_path);
    expect($first->refresh()->webm_path)->toBe($webm)->and($broken->refresh()->webm_path)->toBeNull()
        ->and($done->refresh()->webm_path)->toBe('videos/0/ya.webm');
    Storage::disk('media')->assertExists($webm);
    Process::assertRan(fn (PendingProcess $process): bool => in_array('libvpx-vp9', $process->command, true));
});

it('respects the limit', function () {
    readyVideo();
    readyVideo();
    Process::fake(function (PendingProcess $process) {
        file_put_contents(end($process->command), 'webm');

        return Process::result();
    });

    $this->artisan('videos:webm', ['--limit' => 1])->assertSuccessful();
    expect(InstitutionVideo::query()->whereNotNull('webm_path')->count())->toBe(1);
});
