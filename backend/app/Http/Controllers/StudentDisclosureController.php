<?php

namespace App\Http\Controllers;

use App\Enums\LinkageRequestStatus;
use App\Enums\UserRole;
use App\Http\Requests\ShareStudentProfileRequest;
use App\Models\LinkageRequest;
use App\Models\StudentDisclosure;
use App\Models\User;
use App\Notifications\StudentProfileShared;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Ficha compartida con la empresa (T-S19-05 a T-S19-07; D1 a D5).
 *
 * - La institución comparte grupos de la lista blanca, con el consentimiento confirmado, solo en una vinculación
 *   ACEPTADA de su institución, y puede dejar de compartirlos en cualquier momento.
 * - La empresa lee la ficha en vivo solo de su vinculación ACEPTADA y mientras siga vigente; en otro caso responde 404,
 *   igual que una solicitud ajena o inexistente.
 */
class StudentDisclosureController extends Controller
{
    public function store(ShareStudentProfileRequest $request, string $linkageRequest): JsonResponse
    {
        $user = $request->user();
        try {
            [$linkage, $disclosure] = DB::transaction(function () use ($request, $user, $linkageRequest): array {
                $linkage = $this->institutionLinkage($user, $linkageRequest);
                if ($linkage->disclosures()->active()->exists()) {
                    throw ValidationException::withMessages(['fields' => ['La ficha ya está compartida. Deja de compartirla para elegir otros datos.']]);
                }

                $disclosure = new StudentDisclosure;
                $disclosure->linkage_request_id = $linkage->id;
                $disclosure->institution_id = $linkage->institution_id;
                $disclosure->company_id = $linkage->company_id;
                $disclosure->student_id = $linkage->student_id;
                $disclosure->fields = array_values(array_intersect(StudentDisclosure::SHAREABLE, $request->validated('fields')));
                $disclosure->consent_confirmed_at = now();
                $disclosure->disclosed_by = $user->id;
                $disclosure->disclosed_at = now();
                $disclosure->save();

                return [$linkage, $disclosure];
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['fields' => ['La ficha ya está compartida. Deja de compartirla para elegir otros datos.']]);
        }

        $this->notifyCompany($linkage);

        return response()->json(['data' => self::institutionView($disclosure->setRelation('discloser', $user))], 201)
            ->header('Cache-Control', 'no-store, private');
    }

    public function revoke(Request $request, string $linkageRequest): JsonResponse
    {
        DB::transaction(function () use ($request, $linkageRequest): void {
            $linkage = $this->institutionLinkage($request->user(), $linkageRequest);
            $disclosure = $linkage->disclosures()->active()->lockForUpdate()->first();
            if ($disclosure === null) {
                throw ValidationException::withMessages(['disclosure' => ['La ficha no está compartida.']]);
            }
            $disclosure->revoke($request->user(), StudentDisclosure::REVOKED_BY_INSTITUTION);
        });

        return response()->json(['data' => null])->header('Cache-Control', 'no-store, private');
    }

    /** Lectura de la empresa: solo los grupos compartidos, en vivo. */
    public function show(Request $request, string $linkageRequest): JsonResponse
    {
        $disclosure = StudentDisclosure::query()->active()
            ->where('company_id', $request->user()->company_id)
            ->where('linkage_request_id', (int) $linkageRequest)
            ->whereHas('linkageRequest', fn ($query) => $query->where('status', LinkageRequestStatus::ACCEPTED))
            ->first();
        abort_if($disclosure === null, 404, 'La ficha no está disponible.');

        return response()->json(['data' => $disclosure->sharedProfile()])->header('Cache-Control', 'no-store, private');
    }

    /** Lo que ve la institución de su ficha vigente: grupos, fecha y quién la compartió. */
    public static function institutionView(StudentDisclosure $disclosure): array
    {
        return [
            'fields' => array_values(array_intersect(StudentDisclosure::SHAREABLE, $disclosure->fields)),
            'disclosed_at' => $disclosure->disclosed_at->toISOString(),
            'disclosed_by' => $disclosure->discloser === null ? null : ['name' => $disclosure->discloser->name],
        ];
    }

    /** Vinculación ACEPTADA de la institución de la sesión, bloqueada; ajena o inexistente responde 404. */
    private function institutionLinkage(User $user, string $linkageRequest): LinkageRequest
    {
        $linkage = LinkageRequest::query()->where('institution_id', $user->institution_id)->lockForUpdate()->find((int) $linkageRequest);
        abort_if($linkage === null, 404, 'La solicitud no existe.');
        if ($linkage->status !== LinkageRequestStatus::ACCEPTED) {
            throw ValidationException::withMessages(['status' => ['Solo puedes compartir la ficha de una vinculación aceptada.']]);
        }

        return $linkage;
    }

    /** D5: correo con marca a las cuentas activas de la empresa; si falla, la ficha sigue compartida. */
    private function notifyCompany(LinkageRequest $linkage): void
    {
        $linkage->loadMissing(['company:id,is_active', 'institution:id,name', 'opportunity:id,title']);
        if (! $linkage->company->is_active) {
            return;
        }
        $recipients = User::query()->where('company_id', $linkage->company_id)->where('role', UserRole::COMPANY)
            ->where('is_active', true)->where('password_setup_required', false)->get();
        try {
            Notification::send($recipients, new StudentProfileShared(
                $linkage->institution->label(),
                $linkage->opportunity->title,
                rtrim((string) config('app.frontend_url'), '/').'/linkage-requests/'.$linkage->id,
            ));
        } catch (Throwable $exception) {
            Log::warning('No se pudo avisar a la empresa de la ficha compartida.', ['linkage_request_id' => $linkage->id, 'exception_type' => $exception::class]);
        }
    }
}
