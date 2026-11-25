<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\AccessEmailChangeRequested;
use App\Notifications\ConfirmAccessEmail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Throwable;

/**
 * T-S19-03 y T-S19-04: enlace de un solo uso para confirmar un correo de acceso.
 *
 * - Con correo pendiente, confirma el cambio a esa dirección (se envía a ella; la actual recibe solo un aviso).
 * - Sin correo pendiente, verifica el correo actual.
 *
 * Solo se guarda el hash SHA-256 del token: la URL nunca se registra ni se devuelve por HTTP. Emitir otro enlace (reenvío
 * o nueva solicitud) reemplaza el hash, así que el anterior deja de servir.
 */
class AccessEmailLink
{
    /** Vigencia del enlace. */
    public const MINUTES = 60;

    /** Espera entre envíos, también visible en la interfaz. */
    public const COOLDOWN_SECONDS = 60;

    /** Fija el correo por confirmar (null para verificar el actual) y un enlace nuevo; devuelve la URL. */
    public function issue(User $user, ?string $pendingEmail): string
    {
        $token = Str::random(64);
        $user->forceFill([
            'pending_email' => $pendingEmail,
            'email_token_hash' => hash('sha256', $token),
            'email_token_sent_at' => now(),
        ])->save();

        return rtrim(config('app.frontend_url'), '/').'/confirm-email?'.http_build_query(['token' => $token], '', '&', PHP_QUERY_RFC3986);
    }

    /** Segundos que faltan para poder emitir otro enlace; 0 si ya se puede. */
    public function cooldown(User $user): int
    {
        if ($user->email_token_sent_at === null) {
            return 0;
        }

        return max(0, self::COOLDOWN_SECONDS - (int) $user->email_token_sent_at->diffInSeconds(now()));
    }

    /** Cuenta con el enlace vigente para ese token, o null si no existe, venció o ya se usó. */
    public function find(string $token, bool $lock = false): ?User
    {
        $user = User::query()->where('email_token_hash', hash('sha256', $token))->when($lock, fn ($query) => $query->lockForUpdate())->first();

        return $user !== null && $user->email_token_sent_at !== null && $user->email_token_sent_at->gt(now()->subMinutes(self::MINUTES))
            ? $user
            : null;
    }

    /**
     * Envía el enlace después del commit (se llama fuera de la transacción, para leer el resultado). 'sent' si el transporte lo aceptó (no equivale a entrega en el buzón) o
     * 'pending' si falló: la persona puede reenviarlo desde Mi cuenta.
     */
    public function deliverAfterCommit(User $user, string $url): string
    {
        $status = 'pending';
        $pending = $user->pending_email;
        DB::afterCommit(function () use ($user, $url, $pending, &$status): void {
            try {
                if ($pending === null) {
                    $user->notify(new ConfirmAccessEmail($url, $user->name, change: false));
                } else {
                    Notification::route('mail', $pending)->notify(new ConfirmAccessEmail($url, $user->name, change: true));
                }
                $status = 'sent';
            } catch (Throwable $exception) {
                Log::warning('No se pudo enviar el enlace de confirmación del correo de acceso.', [
                    'user_id' => $user->id,
                    'exception_type' => $exception::class,
                ]);
            }
        });

        return $status;
    }

    /** Aviso a la dirección actual de que se pidió el cambio; sin enlace, para que no sirva de atajo a quien lo pidió. */
    public function warnCurrentAddress(User $user, string $pendingEmail): void
    {
        DB::afterCommit(function () use ($user, $pendingEmail): void {
            try {
                $user->notify(new AccessEmailChangeRequested($pendingEmail));
            } catch (Throwable $exception) {
                Log::warning('No se pudo avisar a la dirección actual del cambio de correo pedido.', [
                    'user_id' => $user->id,
                    'exception_type' => $exception::class,
                ]);
            }
        });
    }
}
