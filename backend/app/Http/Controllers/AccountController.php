<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateAccountRequest;
use App\Http\Requests\UpdatePasswordRequest;
use App\Models\AccountAuditEvent;
use App\Notifications\PasswordChanged;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Mi cuenta (HU-S14-01): la persona de la sesión cambia su nombre y su contraseña, sin depender de Administración ni de
 * la Secretaría. La cuenta sale siempre de la sesión; ninguna ruta acepta un id.
 */
class AccountController extends Controller
{
    /** CA-02: solo el nombre. Sin cambios reales no se registra ningún evento. */
    public function update(UpdateAccountRequest $request, AuthController $auth): JsonResponse
    {
        $user = $request->user();
        $name = $request->validated('name');

        if ($user->name !== $name) {
            DB::transaction(function () use ($user, $name): void {
                $user->forceFill(['name' => $name])->save();
                AccountAuditEvent::record($user, AccountAuditEvent::ACCOUNT_UPDATED, $user, ['name']);
            });
        }

        return $auth->me($request);
    }

    /**
     * CA-03, CA-04: con la contraseña actual correcta, guarda la nueva y deja fuera a cualquier otro dispositivo: borra las
     * demás sesiones de la cuenta, rota `remember_token` e invalida los enlaces de restablecimiento pendientes. La sesión
     * actual se regenera y sigue abierta. El aviso por correo sale de la cola después de confirmar el cambio.
     */
    public function password(UpdatePasswordRequest $request): Response
    {
        $user = $request->user();
        $current = $request->session()->getId();

        DB::transaction(function () use ($user, $request, $current): void {
            $user->forceFill(['password' => Hash::make($request->validated('password'))]);
            $user->setRememberToken(Str::random(60));
            $user->save();

            DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', $current)->delete();
            foreach (['institution_reset', 'institution_setup'] as $broker) {
                Password::broker($broker)->getRepository()->delete($user);
            }
            AccountAuditEvent::record($user, AccountAuditEvent::PASSWORD_CHANGED, $user);
        });

        $request->session()->regenerate(true);
        $user->notify(new PasswordChanged);

        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }
}
