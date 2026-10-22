<?php

namespace App\Http\Controllers;

use App\Models\Municipality;
use Illuminate\Http\JsonResponse;

/** Municipios de un estado del catálogo INEGI (HU-S4-04 CA-07). Datos públicos, iguales para todos los roles. */
class MunicipalityController extends Controller
{
    /** Catálogo estático: cacheable por el navegador y una CDN (cambia solo con una edición nueva del INEGI). */
    private const CACHE_CONTROL = 'public, max-age=86400';

    public function index(string $state): JsonResponse
    {
        $municipalities = Municipality::query()
            ->where('state_code', $state)
            ->orderBy('name')
            ->orderBy('code')
            ->get(['code', 'name']);

        return response()->json(['data' => $municipalities->map(fn (Municipality $municipality): array => [
            'code' => $municipality->code, 'name' => $municipality->name,
        ])->values()])->header('Cache-Control', self::CACHE_CONTROL);
    }
}
