<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SetInitialPassword extends Notification
{
    public function __construct(public readonly string $setupUrl) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Establece tu contraseña — Banco de Talentos')
            ->greeting('Hola, '.$notifiable->name)
            ->line('Se creó tu cuenta institucional. Establece tu propia contraseña para acceder.')
            ->action('Establecer contraseña', $this->setupUrl)
            ->line('El enlace vence en 60 minutos y solo puede utilizarse una vez.');
    }
}
