<?php

namespace App\Http\Controllers\Concerns;

use App\Exceptions\CompanyProfileIncomplete;
use App\Models\Company;

/**
 * HU-S14-03 CA-05 (M1): publicar oportunidades y enviar solicitudes exige que la empresa tenga su nombre visible y el
 * nombre y correo de su contacto. Debe llamarse dentro de la transacción de la escritura: el bloqueo impide que
 * el perfil se vacíe a la mitad.
 */
trait RequiresOperableCompany
{
    protected function ensureOperableCompany(?int $companyId): void
    {
        $company = Company::query()->lockForUpdate()->find($companyId);
        abort_if($company === null, 403);
        $missing = $company->missing(Company::MINIMUM);
        if ($missing !== []) {
            throw new CompanyProfileIncomplete($missing);
        }
    }
}
