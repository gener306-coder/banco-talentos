<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\ResendInstitutionSetupLinkRequest;
use App\Models\Institution;
use App\Models\User;
use App\Services\InitialPasswordLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

class InstitutionSetupLinkController extends Controller
{
    public function store(ResendInstitutionSetupLinkRequest $request, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        [$user, $setupUrl] = DB::transaction(function () use ($data, $links): array {
            // Mismo orden de bloqueos que al consumir el enlace: usuario e institución.
            $user = User::query()->where('email', $data['email'])->lockForUpdate()->first();
            if (! $user || $user->role !== UserRole::INSTITUTION || ! $user->password_setup_required
                || ! $user->is_active || $user->institution_id !== (int) $data['institution_id']) {
                throw ValidationException::withMessages([
                    'email' => ['No hay una cuenta activa pendiente de configuración con ese correo en esta institución.'],
                ]);
            }

            $institution = Institution::query()->lockForUpdate()->find($user->institution_id);
            if (! $institution || ! $institution->is_active) {
                throw ValidationException::withMessages([
                    'institution_id' => ['La institución no existe o no está activa.'],
                ]);
            }

            // Se aplica bajo bloqueo y sobre el token persistido; no depende del proceso HTTP.
            if (Password::broker('institution_setup')->getRepository()->recentlyCreatedToken($user)) {
                throw new TooManyRequestsHttpException(60, 'Espera un minuto antes de reenviar el enlace.');
            }

            return [$user, $links->issue($user)];
        });

        $response = ['setup_delivery' => $links->deliverAfterCommit($user, $setupUrl)];
        if (app()->environment('testing')) {
            $response['setup_url'] = $setupUrl;
        }

        return response()->json($response)->header('Cache-Control', 'no-store, private');
    }
}
