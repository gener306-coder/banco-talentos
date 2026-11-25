import { setupAccount } from '../accounts/api'
import type { SetupAccount } from '../accounts/api'
import { ApiError, request } from '../lib/http'

/** T-S19-02: cuentas de la institución con su estado (activa, pendiente de activar o inactiva) y su verificación. */
export async function listInstitutionAccounts(institutionId: number, signal?: AbortSignal): Promise<SetupAccount[]> {
  const response = await request(`/api/institutions/${institutionId}/accounts`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data)) throw new ApiError(502)
  return response.data.map(setupAccount)
}

export const institutionAccountEmailPath = (institutionId: number, accountId: number) => `/api/institutions/${institutionId}/accounts/${accountId}/email`
