<?php

namespace App\Support;

/**
 * Detecta datos de contacto en texto libre público (HU-S3-01 CA-02): URLs, correos, teléfonos y dominios.
 * Los TLD son una lista corta a propósito: «Node.js», «Vue.js» o «ASP.NET» no son dominios.
 */
final class ContactInformation
{
    public const MESSAGE = 'Los enlaces y datos de contacto van en la sección protegida de enlaces.';

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
