<?php

namespace App\Http\Controllers;

use App\Enums\LinkageRequestStatus;
use App\Http\Requests\StoreLinkageRequestRequest;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Solicitudes de vinculación directas de la empresa a la institución del alumno (HU-S5-04), sin la Secretaría.
 * Privacidad (CA-05): la respuesta identifica al alumno solo por su public_id y nunca lee sus datos protegidos.
 */
class LinkageRequestController extends Controller
{
    private const DUPLICATE = 'Ya enviaste una solicitud para este perfil en esa oportunidad.';

    public function store(StoreLinkageRequestRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        try {
            $linkage = DB::transaction(function () use ($user, $validated): LinkageRequest {
                // CA-03: el mismo universo del buscador (HU-S4-05); fuera de él, el perfil «no existe».
                $student = Student::query()
                    ->join('institutions', 'institutions.id', '=', 'students.institution_id')
                    ->where('institutions.is_active', true)
                    ->searchable()
                    ->where('students.public_id', $validated['student_public_id'])
                    ->select(['students.id', 'students.institution_id', 'students.public_id'])
                    ->first();
                abort_if($student === null, 404, 'El perfil no existe.');

                // Una oportunidad ajena se rechaza igual que una inexistente. FOR SHARE impide que se inactive
                // mientras se registra la solicitud.
                $opportunity = Opportunity::query()
                    ->where('company_id', $user->company_id)
                    ->sharedLock()
                    ->find($validated['opportunity_id']);
                if ($opportunity === null) {
                    throw ValidationException::withMessages(['opportunity_id' => ['La oportunidad no existe.']]);
                }
                if (! $opportunity->is_active) {
                    throw ValidationException::withMessages(['opportunity_id' => ['Solo puedes usar oportunidades activas. Reactívala o elige otra.']]);
                }

                $duplicate = LinkageRequest::query()
                    ->where('company_id', $user->company_id)
                    ->where('student_id', $student->id)
                    ->where('opportunity_id', $opportunity->id)
                    ->whereIn('status', LinkageRequestStatus::ACTIVE)
                    ->exists();
                if ($duplicate) {
                    throw ValidationException::withMessages(['opportunity_id' => [self::DUPLICATE]]);
                }

                // CA-04: trato directo, pendiente de la institución del alumno.
                $linkage = new LinkageRequest(['message' => $validated['message'] ?? null]);
                $linkage->company_id = $user->company_id;
                $linkage->opportunity_id = $opportunity->id;
                $linkage->student_id = $student->id;
                $linkage->institution_id = $student->institution_id;
                $linkage->requested_by = $user->id;
                $linkage->status = LinkageRequestStatus::PENDING_INSTITUTION;
                $linkage->save();

                return $linkage->setRelation('opportunity', $opportunity)->setRelation('student', $student);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos envíos simultáneos: el índice único parcial es la última garantía (CA-03).
            if ($exception->index !== 'linkage_requests_active_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['opportunity_id' => [self::DUPLICATE]]);
        }

        return response()->json(['data' => $this->summary($linkage)], 201)->header('Cache-Control', 'no-store, private');
    }

    /** Lista explícita de campos: el alumno solo por su public_id (CA-05). */
    private function summary(LinkageRequest $linkage): array
    {
        return [
            'id' => $linkage->id,
            'status' => $linkage->status->value,
            'student_public_id' => $linkage->student->public_id,
            'opportunity' => ['id' => $linkage->opportunity->id, 'title' => $linkage->opportunity->title],
            'message' => $linkage->message,
            'created_at' => $linkage->created_at?->toISOString(),
        ];
    }
}
