<?php

namespace App\Support;

/**
 * Número de Seguridad Social del IMSS: 11 dígitos, el último es verificador (algoritmo de Luhn).
 */
final class SocialSecurityNumber
{
    /** Quita espacios y guiones de captura; cualquier otro carácter se conserva para que la validación lo rechace. */
    public static function normalize(string $value): string
    {
        return preg_replace('/[\s-]+/u', '', $value) ?? $value;
    }

    public static function isValid(string $nss): bool
    {
        if (preg_match('/^\d{11}$/', $nss) !== 1) {
            return false;
        }

        $sum = 0;
        foreach (array_reverse(str_split($nss)) as $position => $digit) {
            $value = (int) $digit * ($position % 2 === 1 ? 2 : 1);
            $sum += $value > 9 ? $value - 9 : $value;
        }

        return $sum % 10 === 0;
    }

    /**
     * Índice ciego: HMAC-SHA256 con una clave derivada (HKDF) de APP_KEY, propia de este uso.
     * Permite UNIQUE en PostgreSQL sin guardar el NSS en claro; sin la clave no se puede recorrer
     * el espacio de NSS posibles para revertirlo.
     */
    public static function blindIndex(string $nss): string
    {
        $key = hash_hkdf('sha256', app('encrypter')->getKey(), 32, 'student-social-security-nss-blind-index');

        return hash_hmac('sha256', $nss, $key);
    }
}
