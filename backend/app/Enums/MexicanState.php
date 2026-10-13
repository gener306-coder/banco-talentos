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
}
