<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetInstitutionPassword extends Notification
{
    public function __construct(public readonly string $resetUrl) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Restablece tu contraseña — Banco de Talentos')
            ->greeting('Hola, '.$notifiable->name)
            ->line('El Administrador inició el restablecimiento de la contraseña de tu cuenta institucional.')
            ->action('Restablecer contraseña', $this->resetUrl)
            ->line('El enlace vence en 60 minutos y solo puede utilizarse una vez.')
            ->line('Tu contraseña actual sigue vigente hasta que establezcas una nueva.');
    }
}
