<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Http\Requests\StoreInstitutionRequest;
use App\Http\Requests\UpdateInstitutionRequest;
use App\Http\Requests\UpdateInstitutionStatusRequest;
use App\Models\Institution;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionAccounts;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
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

    /**
     * T-S8-11: el registro crea también la cuenta de la persona responsable con el correo de contacto, en la misma
     * transacción. Después del commit le envía el enlace por correo o, con la entrega manual (HU-S2-01), lo devuelve
     * para que el Administrador lo comparta; con correo, el enlace nunca vuelve en la respuesta.
     */
    public function store(StoreInstitutionRequest $request, InstitutionAccounts $accounts, InitialPasswordLink $links): JsonResponse
    {
        $method = SetupDeliveryMethod::from($request->validated('delivery_method') ?? SetupDeliveryMethod::EMAIL->value);
        $institution = new Institution(Arr::except($request->validated(), ['delivery_method']));

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($institution, $accounts, $request): array {
                $this->saveDetails($institution);

                return $accounts->create($institution, $request->validated('contact_name'), $institution->contact_email, $request->user());
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos registros simultáneos con el mismo correo: la restricción es la última garantía.
            if ($exception->index !== 'users_email_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['contact_email' => ['El correo ya está registrado en otra cuenta.']]);
        }

        return response()->json([
            ...$links->deliver($user, $setupUrl, $method, $request->user()->id),
            'data' => $institution,
        ], 201)->header('Cache-Control', 'no-store, private');
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
