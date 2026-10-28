import { createSetupAccount, isPositiveInt, resendSetupLink, setupAccount } from '../accounts/api'
import type { CreatedSetupAccount, SetupAccount, SetupAccountInput, SetupAccountStatus } from '../accounts/api'
import type { Role } from '../auth/api'
import type { DeliveryMethod, SetupResult } from '../institutions/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Roles que gestionan las cuentas de la Secretaría (HU-S4-01). */
export const SECRETARY_ACCOUNT_MANAGERS: readonly Role[] = ['ADMIN', 'SECRETARY']

// Mensajes propios del módulo; los demás códigos usan los generales.
export const secretaryMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar las cuentas de la Secretaría.',
}

export type SecretaryAccountStatus = SetupAccountStatus
export type SecretaryAccount = SetupAccount
export type SecretaryAccountInput = SetupAccountInput
export type CreatedSecretaryAccount = CreatedSetupAccount

export interface SecretaryAccountPage {
  accounts: SecretaryAccount[]
  page: number
  lastPage: number
  total: number
}

export async function listSecretaryAccounts(page: number, signal?: AbortSignal): Promise<SecretaryAccountPage> {
  const response = await request(`/api/secretary-accounts?page=${encodeURIComponent(String(page))}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta
  if (!('current_page' in meta) || !isPositiveInt(meta.current_page) || !('last_page' in meta) || !isPositiveInt(meta.last_page) ||
      !('total' in meta) || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { accounts: response.data.map(setupAccount), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export function createSecretaryAccount(input: SecretaryAccountInput): Promise<CreatedSecretaryAccount> {
  return createSetupAccount('/api/secretary-accounts', input)
}

export function resendSecretaryAccountSetup(input: { email: string; delivery_method: DeliveryMethod }): Promise<SetupResult> {
  return resendSetupLink('/api/secretary-accounts/resend-setup', input)
}

/** Estado y restablecimiento de contraseña de una cuenta SECRETARY (HU-S6-04 CA-01, CA-02). */
export const secretaryAccountStatusPath = (id: number) => `/api/secretary-accounts/${id}/status`
export const SECRETARY_PASSWORD_RESET_PATH = '/api/secretary-accounts/password-reset/start'
