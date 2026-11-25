<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * T-S19-03 y T-S19-04: enlace de un solo uso para confirmar el correo nuevo o verificar el actual. Se envía a la dirección
 * que se confirma; el nombre llega aparte porque el correo nuevo todavía no es de ninguna cuenta.
 */
class ConfirmAccessEmail extends Notification
{
    public function __construct(public readonly string $url, public readonly string $name, public readonly bool $change) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)->greeting('Hola, '.$this->name);

        $message = $this->change
            ? $message->subject('Confirma tu nuevo correo de acceso — Banco de Talentos')
                ->line('Pediste usar esta dirección como correo de acceso al Banco de Talentos. Tu correo actual seguirá activo hasta que lo confirmes.')
                ->action('Confirmar correo', $this->url)
            : $message->subject('Verifica tu correo de acceso — Banco de Talentos')
                ->line('Confirma que esta dirección es tuya. Así garantizas que podrás restablecer tu contraseña si la olvidas.')
                ->action('Verificar correo', $this->url);

        return $message
            ->line('El enlace vence en 60 minutos y solo puede utilizarse una vez.')
            ->line('Si no lo pediste, ignora este correo: no cambiará nada.');
    }
}
