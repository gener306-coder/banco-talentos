import type { Role } from '../auth/api'
import { ApiError, request } from '../lib/http'

/** Claves de los indicadores de cada rol, en el orden en que se muestran (HU-S5-01 CA-02 a CA-05). */
export const metricKeys = {
  ADMIN: ['active_institutions', 'inactive_institutions', 'active_secretaries', 'pending_secretaries'],
  SECRETARY: ['active_companies', 'inactive_companies', 'pending_secretaries'],
  INSTITUTION: ['active_students', 'searchable_students', 'pending_municipality_students'],
  COMPANY: ['available_talent_profiles'],
} as const satisfies Record<Role, readonly string[]>

export type MetricKey = (typeof metricKeys)[Role][number]

export const metricLabels: Record<MetricKey, string> = {
  active_institutions: 'Instituciones activas',
  inactive_institutions: 'Instituciones inactivas',
  active_secretaries: 'Cuentas de la Secretaría activas',
  pending_secretaries: 'Cuentas de la Secretaría pendientes',
  active_companies: 'Empresas activas',
  inactive_companies: 'Empresas inactivas',
  active_students: 'Alumnos activos',
  searchable_students: 'Visibles en el buscador',
  pending_municipality_students: 'Municipio por confirmar',
  available_talent_profiles: 'Perfiles disponibles',
}

export type Metrics = Partial<Record<MetricKey, number>>

export interface Dashboard {
  role: Role
  /** null: cuenta INSTITUTION o COMPANY sin organización vinculada (CA-06). */
  metrics: Metrics | null
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Indicadores del rol de la sesión. Una respuesta de otro rol o con un conteo inválido se rechaza como 502. */
export async function getDashboard(role: Role, signal?: AbortSignal): Promise<Dashboard> {
  const body = await request('/api/dashboard', { signal })
  if (typeof body !== 'object' || body === null || !('data' in body)) throw new ApiError(502)
  const data = body.data
  if (typeof data !== 'object' || data === null || !('role' in data) || data.role !== role || !('metrics' in data)) {
    throw new ApiError(502)
  }

  const raw = data.metrics
  if (raw === null) return { role, metrics: null }
  if (typeof raw !== 'object') throw new ApiError(502)

  const metrics: Metrics = {}
  for (const key of metricKeys[role]) {
    const value: unknown = (raw as Record<string, unknown>)[key]
    if (!isCount(value)) throw new ApiError(502)
    metrics[key] = value
  }
  return { role, metrics }
}
