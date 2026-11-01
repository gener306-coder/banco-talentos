<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreInstitutionVideoRequest;
use App\Jobs\ProcessInstitutionVideo;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Videos promocionales de la institución de la sesión (HU-S9-01). La subida solo guarda el original y lo encola: el
 * procesamiento ocurre en el worker, fuera de la petición.
 */
class InstitutionVideoController extends Controller
{
    /** Videos activos (en proceso o listos) por institución (CA-03). */
    public const MAX_ACTIVE = 5;

    public function store(StoreInstitutionVideoRequest $request): JsonResponse
    {
        $user = $request->user();
        $file = $request->file('video');

        $video = new InstitutionVideo($request->safe()->only(['title', 'description']));
        // La institución, la autoría y el identificador los asigna el servidor, nunca la petición.
        $video->public_id = (string) Str::uuid();
        $video->institution_id = $user->institution_id;
        $video->created_by = $user->id;
        $video->original_bytes = $file->getSize();
        $video->consent_confirmed_at = now();

        // Nombre aleatorio: la ruta no deriva de nada que envíe el cliente salvo la extensión ya validada.
        $directory = 'videos/originals/'.$video->institution_id;
        $path = $file->storeAs($directory, $video->public_id.'.'.strtolower($file->getClientOriginalExtension()), ProcessInstitutionVideo::SOURCE_DISK);
        abort_if($path === false, 500, 'No se pudo guardar el video.');
        $video->source_path = $path;

        try {
            DB::transaction(function () use ($video): void {
                // Dos subidas simultáneas de la misma institución se ordenan aquí: ninguna rebasa la cuota.
                Institution::query()->lockForUpdate()->findOrFail($video->institution_id);
                $active = InstitutionVideo::query()->where('institution_id', $video->institution_id)->countedInQuota()->count();
                if ($active >= self::MAX_ACTIVE) {
                    throw ValidationException::withMessages([
                        'video' => ['Tu institución ya tiene '.self::MAX_ACTIVE.' videos activos.'],
                    ]);
                }

                $video->save();
                // En la cola de PostgreSQL el trabajo se confirma junto con el video: nunca queda uno sin el otro.
                ProcessInstitutionVideo::dispatch($video->id)->beforeCommit();
            });
        } catch (Throwable $exception) {
            Storage::disk(ProcessInstitutionVideo::SOURCE_DISK)->delete($path);
            throw $exception;
        }

        return $this->present($video, 202);
    }

    private function present(InstitutionVideo $video, int $status = 200): JsonResponse
    {
        return response()->json(['data' => [
            'public_id' => $video->public_id,
            'title' => $video->title,
            'description' => $video->description,
            'status' => $video->status->value,
            'is_active' => $video->is_active,
            'duration_seconds' => $video->duration_seconds,
            'width' => $video->width,
            'height' => $video->height,
            'original_bytes' => $video->original_bytes,
            'output_bytes' => $video->output_bytes,
            'failure_reason' => $video->failure_reason,
            'created_at' => $video->created_at?->toISOString(),
        ]], $status)->header('Cache-Control', 'no-store, private');
    }
}
