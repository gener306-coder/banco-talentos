<?php

namespace App\Enums;

/**
 * Estado de un video promocional (HU-S9-01). Nace PROCESSING al recibirse; el trabajo ProcessInstitutionVideo lo deja
 * READY con el MP4 y el póster en el disco de medios, o FAILED con un motivo legible para la institución.
 */
enum VideoStatus: string
{
    case PROCESSING = 'PROCESSING';
    case READY = 'READY';
    case FAILED = 'FAILED';

    /** Estados que ocupan la cuota de videos activos de la institución (CA-03): un video fallido no cuenta. */
    public const COUNTED = [self::PROCESSING, self::READY];
}
