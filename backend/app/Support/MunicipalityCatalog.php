<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Carga del catálogo INEGI de municipios (HU-S4-04) desde el CSV versionado en el repositorio.
 * Ver database/data/inegi/README.md: fuente, edición, atribución y cómo actualizarlo.
 */
final class MunicipalityCatalog
{
    /** Municipios de la edición fijada; una carga con otro número falla en lugar de dejar el catálogo a medias. */
    public const EXPECTED_COUNT = 2478;

    private const HEADER = ['code', 'state_code', 'municipality_code', 'name', 'reference_locality_code', 'reference_locality_name', 'latitude', 'longitude'];

    private const CHUNK = 500;

    public static function path(): string
    {
        return database_path('data/inegi/municipios.csv');
    }

    /**
     * Upsert idempotente por clave: actualiza nombre y punto sin borrar municipios a los que ya apuntan
     * alumnos o empresas. Funciona igual en desarrollo, pruebas y una base administrada (RDS).
     */
    public static function sync(): int
    {
        $rows = self::rows();

        foreach (array_chunk($rows, self::CHUNK) as $chunk) {
            $values = implode(', ', array_fill(0, count($chunk), '(?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)'));
            $bindings = [];
            foreach ($chunk as $row) {
                // PostGIS recibe longitud y latitud, en ese orden.
                array_push($bindings, $row['code'], $row['state_code'], $row['name'], $row['longitude'], $row['latitude']);
            }

            DB::statement(
                "INSERT INTO municipalities (code, state_code, name, location) VALUES {$values}
                 ON CONFLICT (code) DO UPDATE SET state_code = EXCLUDED.state_code, name = EXCLUDED.name, location = EXCLUDED.location",
                $bindings,
            );
        }

        return count($rows);
    }

    /** @return list<array{code: string, state_code: string, name: string, latitude: float, longitude: float}> */
    public static function rows(): array
    {
        $handle = fopen(self::path(), 'r');
        if ($handle === false) {
            throw new RuntimeException('No se pudo abrir el catálogo de municipios.');
        }

        try {
            if (fgetcsv($handle, escape: '') !== self::HEADER) {
                throw new RuntimeException('El encabezado del catálogo de municipios no es el esperado.');
            }

            $rows = [];
            while (($line = fgetcsv($handle, escape: '')) !== false) {
                [$code, $state, $municipality, $name, , , $latitude, $longitude] = $line;

                if (! preg_match('/^(0[1-9]|[12]\d|3[0-2])\d{3}$/', $code) || $code !== $state.$municipality
                    || $name === '' || ! is_numeric($latitude) || ! is_numeric($longitude)) {
                    throw new RuntimeException("Renglón inválido en el catálogo de municipios: {$code}.");
                }

                $rows[$code] = [
                    'code' => $code,
                    'state_code' => $state,
                    'name' => $name,
                    'latitude' => (float) $latitude,
                    'longitude' => (float) $longitude,
                ];
            }
        } finally {
            fclose($handle);
        }

        if (count($rows) !== self::EXPECTED_COUNT) {
            throw new RuntimeException('El catálogo de municipios tiene '.count($rows).' claves únicas; se esperaban '.self::EXPECTED_COUNT.'.');
        }

        return array_values($rows);
    }
}
