<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * URL pública https para guardar y mostrar como enlace (HU-S3-01). El servidor nunca la abre, pero tampoco
 * admite destinos internos: sin IP, localhost, puertos ni credenciales. Con `$host`, debe ser ese dominio
 * o uno de sus subdominios.
 */
class SafeHttpsUrl implements ValidationRule
{
    public function __construct(private readonly ?string $host = null) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            return;
        }

        if (! self::isSafe($value)) {
            $fail('Escribe una dirección https:// pública y válida.');

            return;
        }

        if ($this->host !== null && ! self::belongsTo(self::host($value), $this->host)) {
            $fail("El enlace debe ser de {$this->host}.");
        }
    }

    public static function host(string $url): string
    {
        return strtolower((string) parse_url($url, PHP_URL_HOST));
    }

    public static function belongsTo(string $host, string $domain): bool
    {
        return $host === $domain || str_ends_with($host, '.'.$domain);
    }

    private static function isSafe(string $url): bool
    {
        if (preg_match('/[\s\x00-\x1F\x7F]/u', $url) === 1 || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $parts = parse_url($url);
        if ($parts === false || strtolower($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            return false;
        }

        $host = strtolower($parts['host'] ?? '');
        if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) !== false) {
            return false;
        }
        foreach (['localhost', 'local', 'internal', 'lan', 'home', 'test', 'example', 'invalid'] as $reserved) {
            if ($host === $reserved || str_ends_with($host, '.'.$reserved)) {
                return false;
            }
        }

        // Al menos dos etiquetas DNS válidas (dominio.tld).
        return preg_match('/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $host) === 1;
    }
}
