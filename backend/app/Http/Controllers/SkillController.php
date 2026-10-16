<?php

namespace App\Http\Controllers;

use App\Models\Skill;
use App\Support\CatalogSlug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Autocompletar del catálogo compartido de habilidades (HU-S3-01). No contiene datos personales. */
class SkillController extends Controller
{
    private const LIMIT = 10;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate(
            ['q' => ['required', 'string', 'max:80']],
            ['q.required' => 'Escribe al menos un carácter.', 'q.string' => 'La búsqueda no es válida.', 'q.max' => 'La búsqueda no debe superar 80 caracteres.'],
        );
        // Prefijo literal: % y _ escritos por el usuario no son comodines.
        $prefix = addcslashes(CatalogSlug::from($validated['q']), '\\%_');

        $skills = Skill::query()
            ->where('slug', 'like', $prefix.'%')
            ->orderBy('slug')
            ->limit(self::LIMIT)
            ->get(['id', 'name', 'kind']);

        return response()->json(['data' => $skills->map(fn (Skill $skill): array => [
            'id' => $skill->id, 'name' => $skill->name, 'kind' => $skill->kind->value,
        ])->values()]);
    }
}
