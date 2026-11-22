<?php

namespace App\Http\Controllers\Concerns;

use App\Exceptions\InstitutionProfileIncomplete;
use App\Models\Institution;

/**
 * HU-S16-08 (D6): hacer buscable a un alumno en /talent, subir un video y aceptar una solicitud exigen que la institución
 * tenga su nombre oficial, su CCT y el nombre y correo del responsable. Debe llamarse dentro de la transacción de la
 * escritura: el bloqueo impide que el perfil se vacíe a la mitad (el guardado del perfil bloquea la misma fila).
 */
trait RequiresOperableInstitution
{
    protected function ensureOperableInstitution(?int $institutionId): void
    {
        $institution = Institution::query()->lockForUpdate()->find($institutionId);
        abort_if($institution === null, 403);
        $missing = $institution->missing();
        if ($missing !== []) {
            throw new InstitutionProfileIncomplete($missing);
        }
    }
}
