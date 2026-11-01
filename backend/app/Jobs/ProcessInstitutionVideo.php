<?php

namespace App\Jobs;

use App\Enums\VideoStatus;
use App\Models\InstitutionVideo;
use App\Support\Video\VideoProcessingFailed;
use App\Support\Video\VideoProcessor;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Procesa un video promocional recién subido (HU-S9-01 CA-05) en la cola `videos`: verifica el contenido con ffprobe,
 * lo transcodifica, genera el póster y guarda ambos en el disco de medios. En cualquier desenlace borra el original y
 * los temporales; un fallo deja FAILED con un motivo legible y sin archivos huérfanos.
 */
class ProcessInstitutionVideo implements ShouldQueue
{
    use Queueable;

    /** Disco privado donde la subida deja el original mientras se procesa. */
    public const SOURCE_DISK = 'local';

    /** Igual que el --timeout del worker; ffmpeg se corta antes (VideoProcessor::TIMEOUT_SECONDS). */
    public int $timeout = 900;

    // Un segundo intento solo cubre un worker que se detuvo a la mitad: los fallos del video se resuelven aquí mismo.
    public int $tries = 2;

    public bool $failOnTimeout = true;

    private const UNEXPECTED = 'No pudimos procesar el video. Intenta subirlo de nuevo.';

    public function __construct(public readonly int $videoId)
    {
        $this->onQueue('videos');
    }

    public function handle(VideoProcessor $processor): void
    {
        $video = InstitutionVideo::query()->find($this->videoId);
        // Ya procesado o descartado (por ejemplo, en el segundo intento).
        if ($video === null || $video->status !== VideoStatus::PROCESSING) {
            return;
        }

        $work = sys_get_temp_dir().'/institution-video-'.$video->public_id;
        $stored = [];

        try {
            File::ensureDirectoryExists($work);
            $source = $this->sourcePath($video);
            $processor->transcode($source, $processor->probe($source), $work.'/video.mp4');
            $output = $processor->probe($work.'/video.mp4');
            $processor->poster($work.'/video.mp4', $output->duration, $work.'/poster.jpg');

            $base = 'videos/'.$video->institution_id.'/'.$video->public_id;
            $stored[] = $this->store($work.'/video.mp4', $base.'.mp4');
            $stored[] = $this->store($work.'/poster.jpg', $base.'.jpg');

            $original = $video->source_path;
            $video->forceFill([
                'status' => VideoStatus::READY,
                'video_path' => $base.'.mp4',
                'poster_path' => $base.'.jpg',
                'duration_seconds' => max(1, (int) round($output->duration)),
                'width' => $output->width,
                'height' => $output->height,
                'output_bytes' => filesize($work.'/video.mp4'),
                'source_path' => null,
            ])->save();
            Storage::disk(self::SOURCE_DISK)->delete($original);
        } catch (VideoProcessingFailed $exception) {
            $this->discard($video, $stored, $exception->getMessage());
        } catch (Throwable $exception) {
            report($exception);
            $this->discard($video, $stored, self::UNEXPECTED);
        } finally {
            File::deleteDirectory($work);
        }
    }

    /** El worker se detuvo o se agotó el tiempo en todos los intentos: el video no puede quedar en proceso para siempre. */
    public function failed(?Throwable $exception): void
    {
        $video = InstitutionVideo::query()->find($this->videoId);
        if ($video?->status === VideoStatus::PROCESSING) {
            $this->discard($video, [], 'El procesamiento tardó demasiado. Intenta con un video más corto o de menor resolución.');
        }
    }

    private function sourcePath(InstitutionVideo $video): string
    {
        $disk = Storage::disk(self::SOURCE_DISK);
        if ($video->source_path === null || ! $disk->exists($video->source_path)) {
            throw new VideoProcessingFailed(self::UNEXPECTED);
        }

        return $disk->path($video->source_path);
    }

    /** Escribe por flujo, para no cargar el video en memoria (y para S3 en producción). */
    private function store(string $file, string $path): string
    {
        $stream = fopen($file, 'rb');
        try {
            if ($stream === false || ! Storage::disk(config('filesystems.media_disk'))->writeStream($path, $stream)) {
                throw new VideoProcessingFailed(self::UNEXPECTED);
            }
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        return $path;
    }

    private function discard(InstitutionVideo $video, array $stored, string $reason): void
    {
        // Sin los cambios a medio guardar: la ruta del original es la que quedó registrada.
        $video->refresh();
        Storage::disk(config('filesystems.media_disk'))->delete($stored);
        if ($video->source_path !== null) {
            Storage::disk(self::SOURCE_DISK)->delete($video->source_path);
        }

        $video->forceFill([
            'status' => VideoStatus::FAILED,
            'failure_reason' => $reason,
            'source_path' => null,
            'video_path' => null,
            'poster_path' => null,
        ])->save();
        Log::info('Video promocional descartado.', ['video' => $video->public_id, 'reason' => $reason]);
    }
}
