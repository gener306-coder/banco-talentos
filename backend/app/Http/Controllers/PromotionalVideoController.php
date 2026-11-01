<?php

namespace App\Http\Controllers;

use App\Enums\VideoStatus;
use App\Http\Requests\DeactivatePromotionalVideoRequest;
use App\Http\Requests\ListPromotionalVideosRequest;
use App\Models\InstitutionVideo;
use App\Support\Video\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

/**
 * Galería de promoción dual (HU-S9-03) para COMPANY, SECRETARY y ADMIN: solo videos listos, activos y de instituciones
 * activas. Lista explícita de campos: nunca ids internos, rutas, ubicaciones ni datos de alumnos.
 */
class PromotionalVideoController extends Controller
{
    private const PER_PAGE = 12;

    public function index(ListPromotionalVideosRequest $request): JsonResponse
    {
        $institution = $request->validated('institution');

        $page = InstitutionVideo::query()
            ->where('status', VideoStatus::READY)
            ->where('is_active', true)
            ->whereHas('institution', fn ($query) => $query->where('is_active', true)
                ->when($institution, fn ($query) => $query->where('public_id', $institution)))
            ->with('institution:id,public_id,name')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => $page->getCollection()->map(fn (InstitutionVideo $video): array => $this->item($video))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'per_page' => self::PER_PAGE,
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * CA-05, moderación mínima: el Administrador inactiva un video de la galería. Desaparece de ella y la institución
     * lo ve inactivo; solo ella puede reactivarlo. Repetir la baja no falla.
     */
    public function deactivate(DeactivatePromotionalVideoRequest $request, string $video): JsonResponse
    {
        $record = Str::isUuid($video) ? InstitutionVideo::query()->where('public_id', $video)->first() : null;
        abort_if($record === null, 404, 'El video no existe.');

        $record->is_active = false;
        $record->save();

        return response()->json(['data' => ['public_id' => $record->public_id, 'is_active' => false]])
            ->header('Cache-Control', 'no-store, private');
    }

    private function item(InstitutionVideo $video): array
    {
        return [
            'public_id' => $video->public_id,
            'title' => $video->title,
            'description' => $video->description,
            'duration_seconds' => $video->duration_seconds,
            'institution' => [
                'public_id' => $video->institution->public_id,
                'name' => $video->institution->name,
            ],
            'poster_url' => MediaUrl::temporary($video->poster_path),
            'video_url' => MediaUrl::temporary($video->video_path),
        ];
    }
}
