<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * T-S19-03: aviso a la dirección actual de que se pidió cambiar el correo de acceso. No trae enlace: el cambio solo se
 * confirma desde la dirección nueva, y la actual sigue funcionando mientras tanto.
 */
class AccessEmailChangeRequested extends Notification
{
    public function __construct(public readonly string $pendingEmail) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Se pidió cambiar tu correo de acceso — Banco de Talentos')
            ->greeting('Hola, '.$notifiable->name)
            ->line("Se pidió cambiar el correo de acceso de tu cuenta a {$this->pendingEmail}. Mientras no se confirme desde esa dirección, sigues entrando con este correo.")
            ->line('Si no fuiste tú, entra a Mi cuenta, cancela el cambio y cambia tu contraseña.');
    }
}
