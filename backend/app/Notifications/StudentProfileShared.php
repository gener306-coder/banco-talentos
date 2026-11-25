<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * T-S19-07 (D5): aviso a las cuentas activas de la empresa de que la institución compartió la ficha de una vinculación.
 * No incluye ningún dato del alumno: la ficha solo se consulta dentro de la plataforma. Al dejar de compartirla no se avisa.
 */
class StudentProfileShared extends Notification
{
    public function __construct(
        public readonly string $institutionName,
        public readonly string $opportunityTitle,
        public readonly string $detailUrl,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("{$this->institutionName} compartió la ficha profesional de un alumno — Banco de Talentos")
            ->greeting('Hola, '.$notifiable->name)
            ->line("{$this->institutionName} compartió la ficha profesional del alumno de tu vinculación para «{$this->opportunityTitle}».")
            ->action('Ver la ficha', $this->detailUrl)
            ->line('Por privacidad, la ficha solo se consulta dentro de la plataforma y la institución puede dejar de compartirla en cualquier momento.')
            ->line('Úsala exclusivamente para fines de evaluación en Educación Dual.');
    }
}
