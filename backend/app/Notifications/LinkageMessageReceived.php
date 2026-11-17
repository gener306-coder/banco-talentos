<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Aviso de mensajes sin leer en la conversación de una solicitud aceptada (HU-S13-05 CA-03): nombra a la organización
 * remitente y la oportunidad, y enlaza al detalle. Nunca incluye el texto del mensaje ni datos del alumno: el correo
 * sale de la plataforma y puede reenviarse.
 */
class LinkageMessageReceived extends Notification
{
    public function __construct(
        public readonly string $senderName,
        public readonly string $opportunityTitle,
        public readonly string $conversationUrl,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Tienes mensajes nuevos de {$this->senderName} — Banco de Talentos")
            ->greeting('Hola, '.$notifiable->name)
            ->line("{$this->senderName} te escribió en la conversación de la solicitud de vinculación para «{$this->opportunityTitle}».")
            ->action('Ver la conversación', $this->conversationUrl)
            ->line('Por privacidad, los mensajes solo se leen dentro de la plataforma.');
    }
}
