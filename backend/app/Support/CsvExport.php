<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Descarga CSV (HU-S7-02): UTF-8 con BOM para que Excel reconozca los acentos, sin caché y sin que el navegador
 * reinterprete el tipo. Cada bloque es una tabla con su encabezado; los bloques se separan con una fila vacía.
 */
class CsvExport
{
    private const FORMULA_PREFIXES = ['=', '+', '-', '@', "\t", "\r"];

    /**
     * @param  iterable<array{0: list<string>, 1: iterable<list<string|int|bool|null>>}>  $blocks  encabezado y filas
     */
    public static function download(string $filename, iterable $blocks): StreamedResponse
    {
        return response()->streamDownload(function () use ($blocks): void {
            $out = fopen('php://output', 'w');
            fwrite($out, "\u{FEFF}");
            $first = true;
            foreach ($blocks as [$header, $rows]) {
                if (! $first) {
                    fwrite($out, "\r\n");
                }
                $first = false;
                self::write($out, $header);
                foreach ($rows as $row) {
                    self::write($out, $row);
                }
            }
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * CA-03: un texto que empieza con =, +, -, @, tabulador o retorno de carro se prefija con una comilla simple para
     * que la hoja de cálculo no lo ejecute como fórmula. Los números no se tocan.
     */
    public static function neutralize(string|int|bool|null $value): string|int
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'Sí' : 'No';
        }
        if (is_int($value)) {
            return $value;
        }

        return $value !== '' && in_array($value[0], self::FORMULA_PREFIXES, true) ? "'".$value : $value;
    }

    private static function write($out, array $row): void
    {
        fputcsv($out, array_map(self::neutralize(...), $row), ',', '"', '', "\r\n");
    }
}
