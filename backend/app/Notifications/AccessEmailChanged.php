<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * HU-S16-04: aviso de cambio del correo de acceso de un Administrador, hecho desde la consola del servidor. Se envía a la
 * dirección anterior (por si no fue la persona) y a la nueva (para confirmar que ya entra con ella). Nunca incluye
 * contraseñas ni enlaces.
 */
class AccessEmailChanged extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public readonly bool $toPreviousAddress)
    {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)->subject('Tu correo de acceso cambió — Banco de Talentos');

        return $this->toPreviousAddress
            ? $message
                ->line('El correo de acceso de tu cuenta de Administración del Banco de Talentos se cambió a otra dirección. Las sesiones abiertas se cerraron.')
                ->line('Si no lo pediste, comunícate de inmediato con el equipo de operación de la plataforma.')
            : $message
                ->line('Desde ahora inicias sesión en el Banco de Talentos con esta dirección. Las sesiones abiertas se cerraron.')
                ->line('Tu contraseña no cambió.');
    }
}
