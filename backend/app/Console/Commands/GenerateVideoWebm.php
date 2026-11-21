<?php

namespace App\Console\Commands;

use App\Enums\VideoStatus;
use App\Models\InstitutionVideo;
use App\Support\Video\VideoProcessingFailed;
use App\Support\Video\VideoProcessor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

/**
 * T-S14-18: genera la versión WebM (VP9 + Opus) de los videos promocionales listos que aún no la tienen (anteriores a
 * la tarea o cuya conversión falló). Lee el MP4 del disco de medios por flujo (sirve también con S3), convierte en un
 * directorio temporal y guarda el WebM junto al MP4. Un fallo deja el video como estaba y sigue con el siguiente.
 */
class GenerateVideoWebm extends Command
{
    protected $signature = 'videos:webm {--limit=0 : Cuántos videos convertir como máximo (0 = todos)}';

    protected $description = 'Genera la versión WebM de los videos promocionales listos que no la tienen.';

    public function handle(VideoProcessor $processor): int
    {
        $disk = Storage::disk(config('filesystems.media_disk'));
        $query = InstitutionVideo::query()->where('status', VideoStatus::READY)->whereNotNull('video_path')->whereNull('webm_path')->orderBy('id');
        $limit = (int) $this->option('limit');
        if ($limit > 0) {
            $query->limit($limit);
        }

        $done = 0;
        $failed = 0;
        foreach ($query->cursor() as $video) {
            $work = sys_get_temp_dir().'/video-webm-'.$video->public_id;
            try {
                File::ensureDirectoryExists($work);
                $source = $disk->readStream($video->video_path);
                if ($source === null || $source === false) {
                    throw new VideoProcessingFailed('No se encontró el MP4.');
                }
                $local = fopen($work.'/video.mp4', 'wb');
                stream_copy_to_stream($source, $local);
                fclose($local);
                fclose($source);

                $processor->webm($work.'/video.mp4', $work.'/video.webm');
                $target = preg_replace('/\.mp4$/', '.webm', $video->video_path);
                $stream = fopen($work.'/video.webm', 'rb');
                $written = $disk->writeStream($target, $stream);
                fclose($stream);
                if (! $written) {
                    throw new VideoProcessingFailed('No se pudo guardar el WebM.');
                }

                // Solo si sigue listo y sin WebM: un video eliminado mientras tanto no recupera archivos.
                $updated = InstitutionVideo::query()->whereKey($video->id)->where('status', VideoStatus::READY)
                    ->whereNotNull('video_path')->whereNull('webm_path')->update(['webm_path' => $target]);
                if ($updated === 0) {
                    $disk->delete($target);
                }
                $done += $updated;
                $this->line("WebM listo: {$video->public_id}");
            } catch (VideoProcessingFailed $exception) {
                $failed++;
                $this->warn("Sin WebM {$video->public_id}: {$exception->getMessage()}");
            } finally {
                File::deleteDirectory($work);
            }
        }

        $this->info("Videos con WebM nuevo: {$done}. Sin convertir: {$failed}.");

        return self::SUCCESS;
    }
}
