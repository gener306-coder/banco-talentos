import type { Role } from '../auth/api'
import { isSectorCode } from '../companies/catalogs'
import type { SectorCode } from '../companies/catalogs'
import { LINKAGE_STATUSES } from '../linkage/api'
import type { LinkageStatus } from '../linkage/api'
import { ApiError, request } from '../lib/http'
import type { FailureMessages } from '../lib/useApiRequest'

/** Roles con acceso al reporte ejecutivo (HU-S7-01 CA-01). */
export const REPORT_VIEWERS: readonly Role[] = ['ADMIN', 'SECRETARY']

export const reportMessages: FailureMessages = {
  403: 'No tienes permiso para consultar el reporte ejecutivo.',
}

export interface InstitutionParticipation {
  id: number
  name: string
  is_active: boolean
  active_students: number
  searchable_profiles: number
  received_requests: number
  accepted_requests: number
}

export interface SectorParticipation {
  sector_code: SectorCode
  active_companies: number
  active_opportunities: number
  accepted_requests: number
}

/** Reporte ejecutivo del programa de Educación Dual: solo conteos agregados (HU-S7-01 CA-02). */
export interface DualProgramReport {
  generated_at: string
  linkage_summary: { total: number; by_status: Record<LinkageStatus, number> }
  by_institution: InstitutionParticipation[]
  by_sector: SectorParticipation[]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Valida y copia solo los campos del contrato; cualquier otro dato que llegue se descarta. */
function counts<K extends string>(source: Record<string, unknown>, keys: readonly K[]): Record<K, number> {
  const result = {} as Record<K, number>
  for (const key of keys) {
    const value = source[key]
    if (!isCount(value)) throw new ApiError(502)
    result[key] = value
  }
  return result
}

const INSTITUTION_COUNTS = ['active_students', 'searchable_profiles', 'received_requests', 'accepted_requests'] as const
const SECTOR_COUNTS = ['active_companies', 'active_opportunities', 'accepted_requests'] as const

function institution(item: unknown): InstitutionParticipation {
  if (!isObject(item) || !isCount(item.id) || typeof item.name !== 'string' || typeof item.is_active !== 'boolean') throw new ApiError(502)
  return { id: item.id, name: item.name, is_active: item.is_active, ...counts(item, INSTITUTION_COUNTS) }
}

function sector(item: unknown): SectorParticipation {
  if (!isObject(item) || !isSectorCode(item.sector_code)) throw new ApiError(502)
  return { sector_code: item.sector_code, ...counts(item, SECTOR_COUNTS) }
}

export async function getDualProgramReport(signal?: AbortSignal): Promise<DualProgramReport> {
  const body = await request('/api/reports/dual-program', { signal })
  const data = isObject(body) ? body.data : null
  if (!isObject(data) || typeof data.generated_at !== 'string' || !isObject(data.linkage_summary) ||
      !isObject(data.linkage_summary.by_status) || !Array.isArray(data.by_institution) || !Array.isArray(data.by_sector)) {
    throw new ApiError(502)
  }
  const { total } = counts(data.linkage_summary, ['total'])

  return {
    generated_at: data.generated_at,
    linkage_summary: { total, by_status: counts(data.linkage_summary.by_status, LINKAGE_STATUSES.map((item) => item.value)) },
    by_institution: data.by_institution.map(institution),
    by_sector: data.by_sector.map(sector),
  }
}
