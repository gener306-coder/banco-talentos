<?php

namespace App\Support\Video;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * Procesamiento de los videos promocionales con ffprobe y ffmpeg (HU-S9-01 CA-05; medición en docs/sprint-9.md, T-S9-01):
 * MP4 H.264 + AAC con el lado corto a 720 px como máximo, ≤ 30 fps, SDR, faststart y sin metadatos (los videos de
 * celular traen GPS). Corre con nice para no competir con la API por CPU.
 */
class VideoProcessor
{
    public const MAX_SECONDS = 300;

    public const SHORT_SIDE = 720;

    public const MAX_FRAME_RATE = 30;

    /** Debajo del --timeout del worker (900 s), para terminar con un motivo legible y no por la fuerza. */
    private const TIMEOUT_SECONDS = 870;

    private const PROBE_TIMEOUT_SECONDS = 60;

    private const UNREADABLE = 'No pudimos leer el video. Verifica que el archivo no esté dañado.';

    /** Funciones de transferencia HDR (PQ y HLG) que se convierten a SDR. */
    private const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67'];

    public function probe(string $path): VideoProbe
    {
        $result = Process::timeout(self::PROBE_TIMEOUT_SECONDS)
            ->run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', $path]);
        $data = $result->successful() ? json_decode($result->output(), true) : null;
        if (! is_array($data)) {
            throw new VideoProcessingFailed(self::UNREADABLE);
        }

        $streams = is_array($data['streams'] ?? null) ? $data['streams'] : [];
        // La portada incrustada de algunos MP4 también es un «video»; no cuenta como pista.
        $video = collect($streams)->first(fn (mixed $stream): bool => is_array($stream)
            && ($stream['codec_type'] ?? null) === 'video' && ($stream['disposition']['attached_pic'] ?? 0) !== 1);
        if ($video === null) {
            throw new VideoProcessingFailed('El archivo no contiene una pista de video.');
        }

        $duration = (float) ($data['format']['duration'] ?? $video['duration'] ?? 0);
        $width = (int) ($video['width'] ?? 0);
        $height = (int) ($video['height'] ?? 0);
        if ($duration <= 0 || $width <= 0 || $height <= 0) {
            throw new VideoProcessingFailed(self::UNREADABLE);
        }
        if ($duration > self::MAX_SECONDS) {
            throw new VideoProcessingFailed('El video dura más de 5 minutos. Recórtalo y vuelve a subirlo.');
        }

        // ffmpeg endereza el video según su rotación; las medidas reales son las ya giradas.
        if (abs((int) $this->rotation($video)) % 180 === 90) {
            [$width, $height] = [$height, $width];
        }

        return new VideoProbe(
            duration: $duration,
            width: $width,
            height: $height,
            frameRate: $this->frameRate($video['avg_frame_rate'] ?? null) ?: $this->frameRate($video['r_frame_rate'] ?? null),
            hasAudio: collect($streams)->contains(fn (mixed $stream): bool => is_array($stream) && ($stream['codec_type'] ?? null) === 'audio'),
            hdr: in_array($video['color_transfer'] ?? null, self::HDR_TRANSFERS, true),
        );
    }

    public function transcode(string $source, VideoProbe $probe, string $target): void
    {
        $color = $probe->hdr ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] : [];

        $this->ffmpeg([
            '-i', $source, '-t', (string) self::MAX_SECONDS,
            '-map', '0:v:0', '-map', '0:a:0?',
            '-vf', self::filters($probe),
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-maxrate', '2500k', '-bufsize', '5000k', ...$color,
            '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
            '-movflags', '+faststart', '-map_metadata', '-1', '-map_chapters', '-1',
            '-threads', '2', $target,
        ]);
    }

    /** Póster JPG en el segundo 2, o a la mitad de un video más corto. */
    public function poster(string $video, float $duration, string $target): void
    {
        $at = $duration >= 4 ? 2.0 : $duration / 2;

        $this->ffmpeg(['-ss', sprintf('%.3f', $at), '-i', $video, '-frames:v', '1', '-q:v', '3', $target]);
    }

    /**
     * Cadena de filtros: HDR a SDR si hace falta, lado corto a 720 px sin agrandar (medidas pares para H.264), fps=30
     * solo si el original tiene más (el filtro sube a 30 un video de 24, medición de T-S9-01) y yuv420p.
     */
    public static function filters(VideoProbe $probe): string
    {
        $filters = [];
        if ($probe->hdr) {
            $filters[] = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';
        }
        $filters[] = min($probe->width, $probe->height) <= self::SHORT_SIDE
            ? 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
            : ($probe->width >= $probe->height ? 'scale=-2:'.self::SHORT_SIDE : 'scale='.self::SHORT_SIDE.':-2');
        if ($probe->frameRate > self::MAX_FRAME_RATE) {
            $filters[] = 'fps='.self::MAX_FRAME_RATE;
        }
        $filters[] = 'format=yuv420p';

        return implode(',', $filters);
    }

    private function ffmpeg(array $arguments): void
    {
        try {
            $result = Process::timeout(self::TIMEOUT_SECONDS)
                ->run(['nice', '-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...$arguments]);
        } catch (ProcessTimedOutException) {
            throw new VideoProcessingFailed('El procesamiento tardó demasiado. Intenta con un video más corto o de menor resolución.');
        }

        if (! $result->successful()) {
            throw new VideoProcessingFailed(self::UNREADABLE);
        }
    }

    private function rotation(array $stream): float
    {
        foreach ($stream['side_data_list'] ?? [] as $side) {
            if (is_array($side) && isset($side['rotation'])) {
                return (float) $side['rotation'];
            }
        }

        return (float) ($stream['tags']['rotate'] ?? 0);
    }

    private function frameRate(mixed $value): float
    {
        if (! is_string($value) || ! preg_match('/^(\d+)\/(\d+)$/', $value, $parts) || (int) $parts[2] === 0) {
            return 0.0;
        }

        return (int) $parts[1] / (int) $parts[2];
    }
}
