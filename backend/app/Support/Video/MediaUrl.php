<?php

namespace App\Support\Video;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

/**
 * URL temporal de un archivo del disco de medios (HU-S9-02). Los archivos nunca son públicos. En S3 o compatibles es
 * una URL prefirmada que no pasa por PHP. En el disco local es una ruta firmada y relativa, que el navegador pide por
 * el mismo origen (proxy de Vite en desarrollo y E2E).
 */
final class MediaUrl
{
    /** Vigencia mínima. La caducidad se redondea a la hora para que la URL no cambie en cada consulta del listado. */
    private const MIN_HOURS = 1;

    public static function temporary(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }

        $disk = config('filesystems.media_disk');
        $expires = now()->startOfHour()->addHours(self::MIN_HOURS + 1);

        if (config("filesystems.disks.{$disk}.driver") === 'local') {
            return URL::temporarySignedRoute('media.show', $expires, ['path' => $path], absolute: false);
        }

        return Storage::disk($disk)->temporaryUrl($path, $expires);
    }
}
