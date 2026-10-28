<?php

namespace App\Support;

/**
 * Detecta datos de contacto en texto libre público (HU-S3-01 CA-02): URLs, correos, teléfonos y dominios.
 * Los TLD son una lista corta a propósito: «Node.js», «Vue.js» o «ASP.NET» no son dominios.
 */
final class ContactInformation
{
    public const MESSAGE = 'Los enlaces y datos de contacto van en la sección protegida de enlaces.';

    /** Oportunidades duales (HU-S5-02 CA-04): la empresa no publica canales de contacto fuera del flujo institucional. */
    public const OPPORTUNITY_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: el contacto con el alumno se coordina con su institución.';

    /** Respuesta institucional (HU-S6-02 CA-01): la empresa ya tiene el contacto de la institución en su bandeja. */
    public const RESPONSE_MESSAGE = 'No incluyas enlaces, correos ni teléfonos: la empresa ya tiene el contacto de tu institución.';

    private const PATTERNS = [
        '~https?://~i',
        '~\bwww\.~i',
        '~[^\s@]+@[^\s@]+\.[^\s@]+~u',
        // Diez o más dígitos seguidos, con separadores habituales de un teléfono: «(834) 123-4567».
        '~(?:\d[\s().-]{0,2}){9}\d~',
        '~\b[a-z0-9][a-z0-9-]*\.(?:com|mx|io|dev|org|app|me)\b~i',
    ];

    public static function present(string $text): bool
    {
        foreach (self::PATTERNS as $pattern) {
            if (preg_match($pattern, $text) === 1) {
                return true;
            }
        }

        return false;
    }
}
