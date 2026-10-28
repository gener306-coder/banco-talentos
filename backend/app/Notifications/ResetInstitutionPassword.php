<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Enlace de restablecimiento (HU-S1-04), también para cuentas SECRETARY y COMPANY (HU-S6-04). */
class ResetInstitutionPassword extends Notification
{
    public const ADMIN_INITIATOR = 'El Administrador inició el restablecimiento de la contraseña de tu cuenta institucional.';

    public const SECRETARY_INITIATOR = 'La Secretaría de Economía inició el restablecimiento de la contraseña de tu cuenta.';

    public function __construct(public readonly string $resetUrl, public readonly string $initiator = self::ADMIN_INITIATOR) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Restablece tu contraseña — Banco de Talentos')
            ->greeting('Hola, '.$notifiable->name)
            ->line($this->initiator)
            ->action('Restablecer contraseña', $this->resetUrl)
            ->line('El enlace vence en 60 minutos y solo puede utilizarse una vez.')
            ->line('Tu contraseña actual sigue vigente hasta que establezcas una nueva.');
    }
}
