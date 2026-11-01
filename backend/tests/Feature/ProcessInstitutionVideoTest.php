<?php

use App\Enums\VideoStatus;
use App\Jobs\ProcessInstitutionVideo;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use App\Models\User;
use App\Support\Video\VideoProbe;
use App\Support\Video\VideoProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// HU-S9-01 CA-05: procesamiento del video en la cola. Con Process::fake se cubren todos los desenlaces; una prueba
// final usa ffmpeg real sobre un video vertical generado con metadatos de ubicación.
uses(RefreshDatabase::class);

/** Video recién subido, con su original en el disco privado. */
function processingVideo(string $original = 'contenido'): InstitutionVideo
{
    $institution = Institution::factory()->create();
    $video = new InstitutionVideo(['title' => 'Talleres']);
    $video->forceFill([
        'public_id' => (string) Str::uuid(),
        'institution_id' => $institution->id,
        'created_by' => User::factory()->forInstitution($institution)->create()->id,
        'original_bytes' => strlen($original),
        'consent_confirmed_at' => now(),
        'source_path' => 'videos/originals/'.$institution->id.'/original.mp4',
    ])->save();
    Storage::disk('local')->put($video->source_path, $original);

    return $video;
}

/** Salida de ffprobe para un video con las medidas y propiedades indicadas. */
function probeJson(array $video = [], float $duration = 92.0, bool $audio = true): string
{
    $streams = [array_replace(['codec_type' => 'video', 'width' => 1920, 'height' => 1080, 'avg_frame_rate' => '24/1', 'color_transfer' => 'bt709'], $video)];
    if ($audio) {
        $streams[] = ['codec_type' => 'audio'];
    }

    return json_encode(['streams' => $streams, 'format' => ['duration' => (string) $duration]], JSON_THROW_ON_ERROR);
}

/**
 * ffprobe responde lo indicado (el primer valor es el original y el segundo, el MP4 procesado) y ffmpeg escribe un
 * archivo en su destino, como haría el real.
 */
function fakeTools(array $probes, bool $ffmpegSucceeds = true): void
{
    Process::fake(function (PendingProcess $process) use (&$probes, $ffmpegSucceeds) {
        $command = $process->command;
        if ($command[0] === 'ffprobe') {
            $output = array_shift($probes);

            return $output === null ? Process::result(errorOutput: 'Invalid data', exitCode: 1) : Process::result($output);
        }
        if (! $ffmpegSucceeds) {
            return Process::result(errorOutput: 'Conversion failed!', exitCode: 1);
        }
        file_put_contents(end($command), str_contains(end($command), 'poster') ? 'jpg' : str_repeat('m', 2048));

        return Process::result();
    });
}

function runVideoJob(InstitutionVideo $video): InstitutionVideo
{
    (new ProcessInstitutionVideo($video->id))->handle(app(VideoProcessor::class));

    return $video->refresh();
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('media');
});

describe('procesamiento (CA-05)', function () {
    it('publishes the MP4 and poster on the media disk and deletes the original', function () {
        $video = processingVideo();
        $source = $video->source_path;
        fakeTools([probeJson(), probeJson(['width' => 1280, 'height' => 720], duration: 91.7)]);

        runVideoJob($video);

        $base = 'videos/'.$video->institution_id.'/'.$video->public_id;
        expect($video->status)->toBe(VideoStatus::READY)
            ->and($video->video_path)->toBe($base.'.mp4')
            ->and($video->poster_path)->toBe($base.'.jpg')
            ->and($video->duration_seconds)->toBe(92)
            ->and([$video->width, $video->height])->toBe([1280, 720])
            ->and($video->output_bytes)->toBe(2048)
            ->and($video->source_path)->toBeNull()
            ->and($video->failure_reason)->toBeNull();
        Storage::disk('media')->assertExists([$base.'.mp4', $base.'.jpg']);
        Storage::disk('local')->assertMissing($source);
    });

    it('transcodes with nice, H.264, faststart and without metadata, and takes the poster at second 2', function () {
        $video = processingVideo();
        fakeTools([probeJson(), probeJson(['width' => 1280, 'height' => 720])]);

        runVideoJob($video);

        Process::assertRan(fn (PendingProcess $process): bool => $process->command[0] === 'nice'
            && in_array('libx264', $process->command, true)
            && collect($process->command)->contains('+faststart')
            && array_slice($process->command, array_search('-map_metadata', $process->command, true), 2) === ['-map_metadata', '-1']
            && $process->command[array_search('-vf', $process->command, true) + 1] === 'scale=-2:720,format=yuv420p');
        Process::assertRan(fn (PendingProcess $process): bool => in_array('-frames:v', $process->command, true)
            && $process->command[array_search('-ss', $process->command, true) + 1] === '2.000');
    });

    it('builds the filters from the real video', function (array $probe, string $filters) {
        expect(VideoProcessor::filters(new VideoProbe(...array_replace(
            ['duration' => 60.0, 'width' => 1920, 'height' => 1080, 'frameRate' => 24.0, 'hasAudio' => true, 'hdr' => false], $probe,
        ))))->toBe($filters);
    })->with([
        'horizontal 1080p a 24 fps: sin fps' => [[], 'scale=-2:720,format=yuv420p'],
        'vertical de celular' => [['width' => 1080, 'height' => 1920], 'scale=720:-2,format=yuv420p'],
        '60 fps: tope de 30' => [['frameRate' => 59.94], 'scale=-2:720,fps=30,format=yuv420p'],
        'pequeño: no se agranda' => [['width' => 640, 'height' => 360], 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p'],
        'HDR: a SDR' => [['hdr' => true], 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,scale=-2:720,format=yuv420p'],
    ]);

    it('reads rotation, frame rate and HDR from ffprobe', function () {
        $path = tempnam(sys_get_temp_dir(), 'probe');
        fakeTools([probeJson(['width' => 1920, 'height' => 1080, 'avg_frame_rate' => '60000/1001', 'color_transfer' => 'arib-std-b67',
            'side_data_list' => [['rotation' => -90]]], duration: 30.5, audio: false)]);

        $probe = app(VideoProcessor::class)->probe($path);

        expect([$probe->width, $probe->height])->toBe([1080, 1920])
            ->and(round($probe->frameRate, 2))->toBe(59.94)
            ->and($probe->hdr)->toBeTrue()
            ->and($probe->hasAudio)->toBeFalse()
            ->and($probe->duration)->toBe(30.5);
        unlink($path);
    });

    it('takes the poster halfway through a video shorter than 4 seconds', function () {
        $video = processingVideo();
        fakeTools([probeJson(duration: 3.0), probeJson(['width' => 1280, 'height' => 720], duration: 3.0)]);

        runVideoJob($video);

        Process::assertRan(fn (PendingProcess $process): bool => in_array('-frames:v', $process->command, true)
            && $process->command[array_search('-ss', $process->command, true) + 1] === '1.500');
    });

    it('skips a video that is no longer processing', function () {
        $video = processingVideo();
        $video->forceFill(['status' => VideoStatus::FAILED, 'failure_reason' => 'Motivo previo'])->save();
        Process::fake();

        runVideoJob($video);

        Process::assertNothingRan();
        expect($video->failure_reason)->toBe('Motivo previo');
    });
});

describe('fallos (CA-05)', function () {
    it('fails with a readable reason and leaves no files behind', function (array $probes, bool $ffmpegSucceeds, string $reason) {
        $video = processingVideo();
        $source = $video->source_path;
        fakeTools($probes, $ffmpegSucceeds);

        runVideoJob($video);

        expect($video->status)->toBe(VideoStatus::FAILED)
            ->and($video->failure_reason)->toBe($reason)
            ->and($video->source_path)->toBeNull()
            ->and($video->video_path)->toBeNull()
            ->and($video->poster_path)->toBeNull();
        Storage::disk('local')->assertMissing($source);
        expect(Storage::disk('media')->allFiles())->toBe([]);
    })->with([
        'no se puede leer' => [[null], true, 'No pudimos leer el video. Verifica que el archivo no esté dañado.'],
        'sin pista de video' => [[json_encode(['streams' => [['codec_type' => 'audio']], 'format' => ['duration' => '20']])], true, 'El archivo no contiene una pista de video.'],
        'solo una portada incrustada' => [[probeJson(['disposition' => ['attached_pic' => 1]])], true, 'El archivo no contiene una pista de video.'],
        'más de 5 minutos' => [[probeJson(duration: 300.5)], true, 'El video dura más de 5 minutos. Recórtalo y vuelve a subirlo.'],
        'ffmpeg falla' => [[probeJson()], false, 'No pudimos leer el video. Verifica que el archivo no esté dañado.'],
    ]);

    it('fails when the original is missing', function () {
        $video = processingVideo();
        Storage::disk('local')->delete($video->source_path);
        Process::fake();

        runVideoJob($video);

        Process::assertNothingRan();
        expect($video->status)->toBe(VideoStatus::FAILED)
            ->and($video->failure_reason)->toBe('No pudimos procesar el video. Intenta subirlo de nuevo.');
    });

    it('marks the video as failed when the worker gives up on it', function () {
        $video = processingVideo();
        $source = $video->source_path;

        (new ProcessInstitutionVideo($video->id))->failed(new RuntimeException('timeout'));

        expect($video->refresh()->status)->toBe(VideoStatus::FAILED)
            ->and($video->failure_reason)->toBe('El procesamiento tardó demasiado. Intenta con un video más corto o de menor resolución.');
        Storage::disk('local')->assertMissing($source);
    });

    it('runs on the videos queue with a timeout no longer than the worker', function () {
        $job = new ProcessInstitutionVideo(1);

        expect($job->queue)->toBe('videos')
            ->and($job->timeout)->toBeLessThanOrEqual(900)
            ->and($job->failOnTimeout)->toBeTrue();
    });
});

describe('ffmpeg real (CA-05, CA-08)', function () {
    it('turns a vertical phone video with GPS into a 720 px MP4 with faststart and no metadata', function () {
        $video = processingVideo();
        $source = Storage::disk('local')->path($video->source_path);
        // 1080×1920 a 60 fps, con ubicación en los metadatos, como un celular.
        Process::run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=60:duration=2',
            '-f', 'lavfi', '-i', 'sine=duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-f', 'mp4',
            '-metadata', 'location=+19.4326-099.1332/', $source])->throw();

        runVideoJob($video);

        expect($video->status)->toBe(VideoStatus::READY)
            ->and([$video->width, $video->height])->toBe([720, 1280])
            ->and($video->duration_seconds)->toBe(2);

        $output = Storage::disk('media')->path($video->video_path);
        $probe = json_decode(Process::run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', $output])->throw()->output(), true);
        $stream = collect($probe['streams'])->firstWhere('codec_type', 'video');
        expect($stream['codec_name'])->toBe('h264')
            ->and($stream['pix_fmt'])->toBe('yuv420p')
            ->and($stream['avg_frame_rate'])->toBe('30/1')
            ->and(collect($probe['streams'])->firstWhere('codec_type', 'audio')['codec_name'])->toBe('aac')
            ->and(array_keys($probe['format']['tags'] ?? []))->not->toContain('location');

        // faststart: el índice (moov) va antes de los datos (mdat).
        $head = file_get_contents($output, length: 64 * 1024);
        expect(strpos($head, 'moov'))->not->toBeFalse()->toBeLessThan(strpos($head, 'mdat') ?: PHP_INT_MAX);

        expect(getimagesize(Storage::disk('media')->path($video->poster_path))[2])->toBe(IMAGETYPE_JPEG);
    });
});
