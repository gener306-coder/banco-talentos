<?php

namespace App\Exceptions;

use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * HU-S16-08 (D6): la institución aún no tiene el mínimo para operar. Es una respuesta esperada, no un error: lleva las
 * claves de lo que falta (sin valores) para que la interfaz enlace al perfil, como `CompanyProfileIncomplete`.
 */
class InstitutionProfileIncomplete extends RuntimeException implements ShouldntReport
{
    /** @param  list<string>  $missing */
    public function __construct(public readonly array $missing)
    {
        parent::__construct('Completa el nombre oficial, el CCT y el nombre y correo del responsable en Mi cuenta para publicar alumnos en la búsqueda de talento, subir videos y aceptar solicitudes.');
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'INSTITUTION_PROFILE_INCOMPLETE',
            'missing' => $this->missing,
        ], 422)->header('Cache-Control', 'no-store, private');
    }
}
