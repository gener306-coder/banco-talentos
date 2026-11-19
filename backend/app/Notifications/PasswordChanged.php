<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Aviso de cambio de contraseña (HU-S14-01 CA-04): avisa a la persona por si no fue ella. Nunca incluye la contraseña.
 * Sale por la cola existente y solo después de confirmar el cambio.
 */
class PasswordChanged extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct()
    {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Tu contraseña cambió — Banco de Talentos')
            ->greeting('Hola, '.$notifiable->name)
            ->line('La contraseña de tu cuenta del Banco de Talentos se cambió. Las demás sesiones abiertas se cerraron.')
            ->line('Si no fuiste tú, pide de inmediato a quien administra tu cuenta que restablezca tu contraseña.');
    }
}
