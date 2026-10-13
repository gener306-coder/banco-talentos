<?php

namespace App\Enums;

/**
 * Entidades federativas con su clave INEGI (HU-S2-03 CA-03). El frontend mantiene los nombres
 * en frontend/src/students/catalogs.ts; si cambia este catálogo, cambia también aquel.
 */
enum MexicanState: string
{
    case AGUASCALIENTES = '01';
    case BAJA_CALIFORNIA = '02';
    case BAJA_CALIFORNIA_SUR = '03';
    case CAMPECHE = '04';
    case COAHUILA = '05';
    case COLIMA = '06';
    case CHIAPAS = '07';
    case CHIHUAHUA = '08';
    case CIUDAD_DE_MEXICO = '09';
    case DURANGO = '10';
    case GUANAJUATO = '11';
    case GUERRERO = '12';
    case HIDALGO = '13';
    case JALISCO = '14';
    case MEXICO = '15';
    case MICHOACAN = '16';
    case MORELOS = '17';
    case NAYARIT = '18';
    case NUEVO_LEON = '19';
    case OAXACA = '20';
    case PUEBLA = '21';
    case QUERETARO = '22';
    case QUINTANA_ROO = '23';
    case SAN_LUIS_POTOSI = '24';
    case SINALOA = '25';
    case SONORA = '26';
    case TABASCO = '27';
    case TAMAULIPAS = '28';
    case TLAXCALA = '29';
    case VERACRUZ = '30';
    case YUCATAN = '31';
    case ZACATECAS = '32';

    /**
     * Punto de referencia del estado [latitud, longitud] en WGS 84: su capital, donde se concentra
     * la población. Es la ubicación aproximada del alumno hasta contar con el catálogo de municipios.
     */
    public function referencePoint(): array
    {
        return match ($this) {
            self::AGUASCALIENTES => [21.8818, -102.2916],
            self::BAJA_CALIFORNIA => [32.6245, -115.4523],
            self::BAJA_CALIFORNIA_SUR => [24.1426, -110.3128],
            self::CAMPECHE => [19.8301, -90.5349],
            self::COAHUILA => [25.4232, -101.0053],
            self::COLIMA => [19.2433, -103.7250],
            self::CHIAPAS => [16.7516, -93.1029],
            self::CHIHUAHUA => [28.6320, -106.0691],
            self::CIUDAD_DE_MEXICO => [19.4326, -99.1332],
            self::DURANGO => [24.0277, -104.6532],
            self::GUANAJUATO => [21.0190, -101.2574],
            self::GUERRERO => [17.5515, -99.5006],
            self::HIDALGO => [20.1011, -98.7591],
            self::JALISCO => [20.6597, -103.3496],
            self::MEXICO => [19.2826, -99.6557],
            self::MICHOACAN => [19.7060, -101.1950],
            self::MORELOS => [18.9242, -99.2216],
            self::NAYARIT => [21.5042, -104.8946],
            self::NUEVO_LEON => [25.6866, -100.3161],
            self::OAXACA => [17.0732, -96.7266],
            self::PUEBLA => [19.0414, -98.2063],
            self::QUERETARO => [20.5888, -100.3899],
            self::QUINTANA_ROO => [18.5001, -88.2961],
            self::SAN_LUIS_POTOSI => [22.1565, -100.9855],
            self::SINALOA => [24.8091, -107.3940],
            self::SONORA => [29.0729, -110.9559],
            self::TABASCO => [17.9892, -92.9475],
            self::TAMAULIPAS => [23.7369, -99.1411],
            self::TLAXCALA => [19.3139, -98.2404],
            self::VERACRUZ => [19.5438, -96.9102],
            self::YUCATAN => [20.9674, -89.5926],
            self::ZACATECAS => [22.7709, -102.5832],
        };
    }
}
