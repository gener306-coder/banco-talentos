<?php

namespace App\Exceptions;

use Illuminate\Contracts\Debug\ShouldntReport;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * HU-S14-03 CA-05 (M1): la empresa aún no tiene el mínimo para operar. Es una respuesta esperada, no un error: lleva las
 * claves de lo que falta (sin valores) para que la interfaz enlace al perfil.
 */
class CompanyProfileIncomplete extends RuntimeException implements ShouldntReport
{
    /** @param  list<string>  $missing */
    public function __construct(public readonly array $missing)
    {
        parent::__construct('Completa el nombre de tu empresa y el nombre y correo del contacto en Mi cuenta para publicar oportunidades y enviar solicitudes.');
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'COMPANY_PROFILE_INCOMPLETE',
            'missing' => $this->missing,
        ], 422)->header('Cache-Control', 'no-store, private');
    }
}
