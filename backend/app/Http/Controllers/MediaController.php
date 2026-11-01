<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Sirve un video o póster del disco de medios local con una URL firmada y temporal (App\Support\Video\MediaUrl). La
 * firma es la credencial, igual que una URL prefirmada de S3. BinaryFileResponse responde Range (206), que Safari
 * exige para reproducir video.
 */
class MediaController extends Controller
{
    private const TYPES = ['mp4' => 'video/mp4', 'jpg' => 'image/jpeg'];

    public function __invoke(string $path): BinaryFileResponse
    {
        $disk = Storage::disk(config('filesystems.media_disk'));
        $type = self::TYPES[pathinfo($path, PATHINFO_EXTENSION)] ?? null;

        abort_if($type === null || str_contains($path, '..') || ! $disk->exists($path), 404);

        return response()->file($disk->path($path), [
            'Content-Type' => $type,
            'X-Content-Type-Options' => 'nosniff',
            // Solo este navegador y mientras dure la firma.
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }
}
