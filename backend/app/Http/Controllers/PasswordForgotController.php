<?php

namespace App\Http\Controllers;

use App\Http\Requests\ForgotPasswordRequest;
use App\Models\User;
use App\Notifications\ResetInstitutionPassword;
use App\Services\InstitutionPasswordResetLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;

/**
 * «Olvidé mi contraseña» de autoservicio para los 4 roles (HU-S16-03, D2).
 *
 * La respuesta es siempre la misma (202), exista o no la cuenta, para no revelar qué correos están registrados. El
 * enlace se emite después de enviar la respuesta, así que el tiempo de respuesta tampoco lo revela. Solo se envía a
 * una cuenta activa, con su contraseña configurada y con su organización activa, y respeta el minuto entre enlaces
 * del mismo broker que el restablecimiento iniciado por Administración o la Secretaría.
 */
class PasswordForgotController extends Controller
{
    public const NEUTRAL_MESSAGE = 'Si el correo corresponde a una cuenta activa, en unos minutos recibirás un enlace para restablecer tu contraseña. Revisa también tu carpeta de correo no deseado.';

    public function store(ForgotPasswordRequest $request, InstitutionPasswordResetLink $links): JsonResponse
    {
        $email = $request->validated('email');

        dispatch(function () use ($email, $links): void {
            self::sendIfEligible($email, $links);
        })->afterResponse();

        return response()->json(['message' => self::NEUTRAL_MESSAGE], 202);
    }

    /** Envía el enlace solo si la cuenta puede usarlo; en cualquier otro caso no hace nada. */
    public static function sendIfEligible(string $email, InstitutionPasswordResetLink $links): void
    {
        $user = User::query()->where('email', $email)->first();
        // accessRestriction(): organización inactiva o contraseña pendiente de configurar.
        if ($user === null || ! $user->is_active || $user->accessRestriction() !== null) {
            return;
        }
        if (Password::broker('institution_reset')->getRepository()->recentlyCreatedToken($user)) {
            return;
        }

        $links->deliverAfterCommit($user, $links->issue($user), ResetInstitutionPassword::SELF_INITIATOR);
    }
}
