<?php

namespace App\Enums;

/**
 * Cómo llega el enlace de configuración inicial a la persona titular (HU-S2-01).
 */
enum SetupDeliveryMethod: string
{
    // Correo al buzón registrado; el ADMIN nunca ve el enlace.
    case EMAIL = 'email';
    // Sin correo: el ADMIN recibe el enlace para compartirlo por otro medio.
    case MANUAL = 'manual';
}
