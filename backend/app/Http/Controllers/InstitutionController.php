<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreInstitutionRequest;
use App\Http\Requests\UpdateInstitutionRequest;
use App\Http\Requests\UpdateInstitutionStatusRequest;
use App\Models\Institution;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InstitutionController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Institution::query()->orderBy('id')->get(),
        ]);
    }

    public function store(StoreInstitutionRequest $request): JsonResponse
    {
        $institution = new Institution($request->validated());
        $this->saveDetails($institution);

        return response()->json(['data' => $institution], 201);
    }

    public function show(Institution $institution): JsonResponse
    {
        return response()->json(['data' => $institution]);
    }

    public function update(UpdateInstitutionRequest $request, Institution $institution): JsonResponse
    {
        $institution->fill($request->validated());
        $this->saveDetails($institution);

        return response()->json(['data' => $institution]);
    }

    public function updateStatus(UpdateInstitutionStatusRequest $request, Institution $institution): JsonResponse
    {
        $institution->is_active = $request->validated('is_active');
        $institution->save();

        return response()->json(['data' => $institution]);
    }

    private function saveDetails(Institution $institution): void
    {
        try {
            DB::transaction(fn () => $institution->save());
        } catch (UniqueConstraintViolationException $exception) {
            if ($exception->index !== 'institutions_cct_unique') {
                throw $exception;
            }

            // La restricción también cubre solicitudes concurrentes que superan
            // la validación de unicidad antes de que la otra solicitud escriba.
            throw ValidationException::withMessages([
                'cct' => ['La Clave de Centro de Trabajo ya está registrada.'],
            ]);
        }
    }
}
