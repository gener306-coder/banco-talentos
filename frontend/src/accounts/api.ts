import { manualSetupLink, setupDelivery } from '../institutions/api'
import type { DeliveryMethod, ResetDelivery, SetupDelivery, SetupResult } from '../institutions/api'
import { ApiError, request } from '../lib/http'

/**
 * Cuentas que se dan de alta con enlace de configuración: de la Secretaría (HU-S4-01) y de empresa (HU-S4-03).
 * Mismo contrato de listado, alta y reenvío; cambia solo la ruta.
 */
export type SetupAccountStatus = 'active' | 'pending' | 'inactive'

export interface SetupAccount {
  id: number
  name: string
  email: string
  /** Activa, pendiente de su primera contraseña o inactiva. */
  status: SetupAccountStatus
  created_at: string
}

export interface SetupAccountInput {
  name: string
  email: string
  delivery_method: DeliveryMethod
}

export interface CreatedSetupAccount {
  account: SetupAccount
  delivery: SetupDelivery
  setupLink?: string
}

const isStatus = (value: unknown): value is SetupAccountStatus => value === 'active' || value === 'pending' || value === 'inactive'
export const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function setupAccount(data: unknown): SetupAccount {
  if (typeof data !== 'object' || data === null ||
      !('id' in data) || !isPositiveInt(data.id) ||
      !('name' in data) || typeof data.name !== 'string' ||
      !('email' in data) || typeof data.email !== 'string' ||
      !('status' in data) || !isStatus(data.status) ||
      !('created_at' in data) || typeof data.created_at !== 'string') throw new ApiError(502)
  // Solo se conservan los campos del contrato.
  return { id: data.id, name: data.name, email: data.email, status: data.status, created_at: data.created_at }
}

export async function createSetupAccount(path: string, input: SetupAccountInput): Promise<CreatedSetupAccount> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  const response = await request(path, {
    method: 'POST',
    body: JSON.stringify({ name: input.name, email: input.email, delivery_method: input.delivery_method }),
  })
  if (typeof response !== 'object' || response === null || !('data' in response)) throw new ApiError(502)
  const delivery = setupDelivery(response, true) as SetupDelivery
  const setupLink = manualSetupLink(response, delivery)
  return { account: setupAccount(response.data), delivery, ...(setupLink ? { setupLink } : {}) }
}

export async function resendSetupLink(path: string, input: { email: string; delivery_method: DeliveryMethod }): Promise<SetupResult> {
  await request('/sanctum/csrf-cookie')
  const response = await request(path, {
    method: 'POST',
    body: JSON.stringify({ email: input.email, delivery_method: input.delivery_method }),
  })
  const delivery = setupDelivery(response, true) as SetupDelivery
  const setupLink = manualSetupLink(response, delivery)
  return setupLink ? { delivery, setupLink } : { delivery }
}

/** Estado de una cuenta que ya configuró su contraseña (HU-S6-04 CA-01, CA-03); devuelve la cuenta actualizada. */
export async function setSetupAccountStatus(path: string, active: boolean): Promise<SetupAccount> {
  await request('/sanctum/csrf-cookie')
  const response = await request(path, { method: 'PATCH', body: JSON.stringify({ is_active: active }) })
  if (typeof response !== 'object' || response === null || !('data' in response)) throw new ApiError(502)
  return setupAccount(response.data)
}

/**
 * Inicio del restablecimiento de contraseña por correo (HU-S6-04 CA-02, CA-03). Solo identifica la cuenta: nunca se
 * envían ni reciben contraseñas, tokens o enlaces.
 */
export async function startSetupAccountPasswordReset(path: string, email: string): Promise<ResetDelivery> {
  await request('/sanctum/csrf-cookie')
  const response = await request(path, { method: 'POST', body: JSON.stringify({ email }) })
  const value = typeof response === 'object' && response !== null && 'reset_delivery' in response ? response.reset_delivery : undefined
  if (value !== 'sent' && value !== 'pending') throw new ApiError(502)
  return value
}
