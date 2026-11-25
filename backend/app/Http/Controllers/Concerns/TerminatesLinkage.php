<?php

namespace App\Http\Controllers\Concerns;

use App\Enums\LinkageParty;
use App\Enums\LinkageRequestStatus;
use App\Models\LinkageRequest;
use App\Models\StudentDisclosure;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * T-S14-13: baja de una vinculación aceptada, compartida por la institución y la empresa. Solo una solicitud propia
 * (ajena o inexistente: 404, anti-IDOR) y ACEPTADA (si no, 422 sin cambios). La fila se bloquea para que las dos partes
 * no la den de baja a la vez. La baja libera el lugar: la oportunidad solo cuenta las ACEPTADAS.
 */
trait TerminatesLinkage
{
    private function terminateLinkage(User $user, LinkageParty $party, int $organizationId, string $linkageRequest, string $reason): LinkageRequest
    {
        return DB::transaction(function () use ($user, $party, $organizationId, $linkageRequest, $reason): LinkageRequest {
            $linkage = LinkageRequest::query()->where($party->ownerColumn(), $organizationId)->lockForUpdate()->find((int) $linkageRequest);
            abort_if($linkage === null, 404, 'La solicitud no existe.');

            if ($linkage->status !== LinkageRequestStatus::ACCEPTED) {
                throw ValidationException::withMessages(['status' => ['Solo puedes dar de baja vinculaciones aceptadas.']]);
            }
            $linkage->status = LinkageRequestStatus::TERMINATED;
            $linkage->terminated_at = now();
            $linkage->terminated_by = $user->id;
            $linkage->terminated_party = $party;
            $linkage->termination_reason = $reason;
            $linkage->save();
            // D4: la baja deja de compartir la ficha en la misma transacción.
            $linkage->disclosures()->active()->lockForUpdate()->first()?->revoke($user, StudentDisclosure::REVOKED_BY_TERMINATION);

            return $linkage;
        });
    }
}
