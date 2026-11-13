<?php

namespace App\Http\Controllers;

use App\Support\SkillCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Autocompletar del catálogo compartido de habilidades (HU-S3-01), tolerante a errores ortográficos (T-S10-01).
 * No contiene datos personales.
 */
class SkillController extends Controller
{
    private const LIMIT = 10;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate(
            ['q' => ['required', 'string', 'max:80']],
            ['q.required' => 'Escribe al menos un carácter.', 'q.string' => 'La búsqueda no es válida.', 'q.max' => 'La búsqueda no debe superar 80 caracteres.'],
        );

        // Cada resultado indica si coincide por prefijo, por alias o por similitud (`match`), para que el cliente no
        // preseleccione una sugerencia aproximada (HU-S10-02).
        return response()->json(['data' => SkillCatalog::search($validated['q'], self::LIMIT)]);
    }
}
