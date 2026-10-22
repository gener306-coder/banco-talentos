import { ApiError, request } from '../lib/http'
import { isStateCode } from './catalogs'

/** Municipio del catálogo INEGI (HU-S4-04): clave de 5 dígitos y nombre oficial. */
export interface Municipality {
  code: string
  name: string
}

const isMunicipality = (value: unknown): value is Municipality =>
  typeof value === 'object' && value !== null &&
  'code' in value && typeof value.code === 'string' && /^\d{5}$/.test(value.code) &&
  'name' in value && typeof value.name === 'string' && value.name !== ''

// El catálogo solo cambia con una edición nueva del INEGI: cada estado se descarga una vez por sesión.
const cache = new Map<string, Municipality[]>()

export async function listMunicipalities(state: string, signal?: AbortSignal): Promise<Municipality[]> {
  if (!isStateCode(state)) throw new ApiError(404)
  const cached = cache.get(state)
  if (cached) return cached

  const response = await request(`/api/catalogs/states/${encodeURIComponent(state)}/municipalities`, { signal })
  if (typeof response !== 'object' || response === null || !('data' in response) || !Array.isArray(response.data) ||
      !response.data.every(isMunicipality) || !response.data.every((municipality) => municipality.code.startsWith(state))) {
    throw new ApiError(502)
  }
  // Solo se conservan los campos del contrato.
  const municipalities = response.data.map(({ code, name }) => ({ code, name }))
  cache.set(state, municipalities)
  return municipalities
}

/** Solo para pruebas: vacía la caché entre casos. */
export function clearMunicipalityCache(): void {
  cache.clear()
}
