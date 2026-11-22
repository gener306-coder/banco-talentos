import { createSetupAccount, isPositiveInt, resendSetupLink, setupAccount } from '../accounts/api'
import type { CreatedSetupAccount, SetupAccount, SetupAccountInput } from '../accounts/api'
import type { DeliveryMethod, SetupResult } from '../institutions/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Cuentas de Administración (HU-S16-02): solo ADMIN las gestiona. */
export const adminAccountMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar las cuentas de Administración.',
}

export interface AdminAccountPage {
  accounts: SetupAccount[]
  page: number
  lastPage: number
  total: number
}

export async function listAdminAccounts(page: number, signal?: AbortSignal): Promise<AdminAccountPage> {
  const response = await request(`/api/admin-accounts?page=${encodeURIComponent(String(page))}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta
  if (!('current_page' in meta) || !isPositiveInt(meta.current_page) || !('last_page' in meta) || !isPositiveInt(meta.last_page) ||
      !('total' in meta) || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { accounts: response.data.map(setupAccount), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export function createAdminAccount(input: SetupAccountInput): Promise<CreatedSetupAccount> {
  return createSetupAccount('/api/admin-accounts', input)
}

export function resendAdminAccountSetup(input: { email: string; delivery_method: DeliveryMethod }): Promise<SetupResult> {
  return resendSetupLink('/api/admin-accounts/resend-setup', input)
}

/** Estado y restablecimiento de contraseña de una cuenta ADMIN. */
export const adminAccountStatusPath = (id: number) => `/api/admin-accounts/${id}/status`
export const ADMIN_PASSWORD_RESET_PATH = '/api/admin-accounts/password-reset/start'
