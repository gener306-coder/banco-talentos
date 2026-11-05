<?php

namespace App\Http\Controllers;

use App\Enums\VideoStatus;
use App\Http\Requests\StoreInstitutionVideoRequest;
use App\Http\Requests\UpdateInstitutionVideoRequest;
use App\Http\Requests\UpdateInstitutionVideoStatusRequest;
use App\Jobs\ProcessInstitutionVideo;
use App\Models\Institution;
use App\Models\InstitutionVideo;
use App\Support\Video\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Videos promocionales de la institución de la sesión (HU-S9-01, HU-S9-02). La subida solo guarda el original y lo
 * encola: el procesamiento ocurre en el worker, fuera de la petición. Toda consulta se filtra por la institución de la
 * sesión; el video de otra responde 404 igual que uno inexistente.
 */
class InstitutionVideoController extends Controller
{
    /** Videos activos (en proceso o listos) por institución (CA-03). */
    public const MAX_ACTIVE = 5;

    /** CA-01: todos los videos de la institución, del más reciente al más antiguo. La cuota acota los activos. */
    public function index(Request $request): JsonResponse
    {
        $videos = InstitutionVideo::query()
            ->where('institution_id', $request->user()->institution_id)
            ->orderByDesc('created_at')->orderByDesc('id')
            ->get();

        return response()->json(['data' => $videos->map(fn (InstitutionVideo $video): array => $this->fields($video))->values()])
            ->header('Cache-Control', 'no-store, private');
    }

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
                $this->ensureQuota($video, 'video');
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

    /** CA-02: solo el título y la descripción; el archivo no se reemplaza (se sube uno nuevo). */
    public function update(UpdateInstitutionVideoRequest $request, string $video): JsonResponse
    {
        $record = $this->owned($request, $video);
        $record->fill($request->safe()->only(['title', 'description']));
        $record->save();

        return $this->present($record);
    }

    /** CA-03: baja lógica. Reactivar respeta la cuota; repetir el mismo estado no falla. */
    public function updateStatus(UpdateInstitutionVideoStatusRequest $request, string $video): JsonResponse
    {
        $record = $this->owned($request, $video);
        $active = $request->validated('is_active');

        DB::transaction(function () use ($record, $active): void {
            if ($active && ! $record->is_active) {
                $this->ensureQuota($record, 'is_active');
            }
            $record->is_active = $active;
            $record->save();
        });

        return $this->present($record);
    }

    /**
     * CA-03 de HU-S9-01: hasta MAX_ACTIVE videos en proceso o listos. Se llama dentro de una transacción; el bloqueo de
     * la fila de la institución ordena las subidas y reactivaciones simultáneas para que ninguna rebase la cuota. Un
     * video fallido no ocupa lugar, así que reactivarlo nunca la rebasa.
     */
    private function ensureQuota(InstitutionVideo $video, string $field): void
    {
        Institution::query()->lockForUpdate()->findOrFail($video->institution_id);
        if ($video->exists && ! in_array($video->status, VideoStatus::COUNTED, true)) {
            return;
        }

        $active = InstitutionVideo::query()
            ->where('institution_id', $video->institution_id)
            ->when($video->exists, fn ($query) => $query->whereKeyNot($video->getKey()))
            ->countedInQuota()
            ->count();
        if ($active >= self::MAX_ACTIVE) {
            throw ValidationException::withMessages([$field => ['Tu institución ya tiene '.self::MAX_ACTIVE.' videos activos.']]);
        }
    }

    /** CA-04: el video de otra institución, uno inexistente o un identificador mal formado responden el mismo 404. */
    private function owned(Request $request, string $publicId): InstitutionVideo
    {
        $video = Str::isUuid($publicId) ? InstitutionVideo::query()
            ->where('institution_id', $request->user()->institution_id)
            ->where('public_id', $publicId)
            ->first() : null;

        abort_if($video === null, 404, 'El video no existe.');

        return $video;
    }

    private function present(InstitutionVideo $video, int $status = 200): JsonResponse
    {
        return response()->json(['data' => $this->fields($video)], $status)->header('Cache-Control', 'no-store, private');
    }

    /** Lista explícita de campos: nunca el id interno ni las rutas de archivos. Las URLs solo existen si está listo. */
    private function fields(InstitutionVideo $video): array
    {
        $ready = $video->status === VideoStatus::READY;

        return [
            'public_id' => $video->public_id,
            'title' => $video->title,
            'description' => $video->description,
            'status' => $video->status->value,
            'is_active' => $video->is_active,
            'duration_seconds' => $video->duration_seconds,
            'width' => $video->width,
            'height' => $video->height,
            'failure_reason' => $video->failure_reason,
            'created_at' => $video->created_at?->toISOString(),
            'poster_url' => $ready ? MediaUrl::temporary($video->poster_path) : null,
            'video_url' => $ready ? MediaUrl::temporary($video->video_path) : null,
        ];
    }
}
