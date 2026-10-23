import type { Role } from '../auth/api'
import { manualSetupLink, setupDelivery } from '../institutions/api'
import type { DeliveryMethod, SetupDelivery, SetupResult } from '../institutions/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Roles que gestionan las cuentas de la Secretaría (HU-S4-01). */
export const SECRETARY_ACCOUNT_MANAGERS: readonly Role[] = ['ADMIN', 'SECRETARY']

// Mensajes propios del módulo; los demás códigos usan los generales.
export const secretaryMessages: FailureMessages = {
  403: 'No tienes permiso para gestionar las cuentas de la Secretaría.',
}

export type SecretaryAccountStatus = 'active' | 'pending' | 'inactive'

export interface SecretaryAccount {
  id: number
  name: string
  email: string
  /** Activa, pendiente de su primera contraseña o inactiva (CA-05). */
  status: SecretaryAccountStatus
  created_at: string
}

export interface SecretaryAccountPage {
  accounts: SecretaryAccount[]
  page: number
  lastPage: number
  total: number
}

export interface SecretaryAccountInput {
  name: string
  email: string
  delivery_method: DeliveryMethod
}

export interface CreatedSecretaryAccount {
  account: SecretaryAccount
  delivery: SetupDelivery
  setupLink?: string
}

const isStatus = (value: unknown): value is SecretaryAccountStatus => value === 'active' || value === 'pending' || value === 'inactive'
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function account(data: unknown): SecretaryAccount {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || !isPositiveInt(data.id) ||
      !('name' in data) || typeof data.name !== 'string' ||
      !('email' in data) || typeof data.email !== 'string' ||
      !('status' in data) || !isStatus(data.status) ||
      !('created_at' in data) || typeof data.created_at !== 'string') throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return { id: data.id, name: data.name, email: data.email, status: data.status, created_at: data.created_at }
}

export async function listSecretaryAccounts(page: number, signal?: AbortSignal): Promise<SecretaryAccountPage> {
  const response = await request(`/api/secretary-accounts?page=${encodeURIComponent(String(page))}`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !('meta' in response) || typeof response.meta !== 'object' || response.meta === null) throw new ApiError(502)
  const meta = response.meta
  if (!('current_page' in meta) || !isPositiveInt(meta.current_page) || !('last_page' in meta) || !isPositiveInt(meta.last_page) ||
      !('total' in meta) || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0) throw new ApiError(502)
  return { accounts: response.data.map(account), page: meta.current_page, lastPage: meta.last_page, total: meta.total }
}

export async function createSecretaryAccount(input: SecretaryAccountInput): Promise<CreatedSecretaryAccount> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/secretary-accounts', {
    method: 'POST',
    body: JSON.stringify({ name: input.name, email: input.email, delivery_method: input.delivery_method }),
  })
  if (typeof response !== 'object' || response === null || !('data' in response)) throw new ApiError(502)
  const delivery = setupDelivery(response, true) as SetupDelivery
  const setupLink = manualSetupLink(response, delivery)
  return { account: account(response.data), delivery, ...(setupLink ? { setupLink } : {}) }
}

export async function resendSecretaryAccountSetup(input: { email: string; delivery_method: DeliveryMethod }): Promise<SetupResult> {
  await request('/sanctum/csrf-cookie')
  const response = await request('/api/secretary-accounts/resend-setup', {
    method: 'POST',
    body: JSON.stringify({ email: input.email, delivery_method: input.delivery_method }),
  })
  const delivery = setupDelivery(response, true) as SetupDelivery
  const setupLink = manualSetupLink(response, delivery)
  return setupLink ? { delivery, setupLink } : { delivery }
}
