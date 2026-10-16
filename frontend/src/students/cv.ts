import { ApiError, request } from '../lib/http'
import { isCvLanguage, isLanguageLevel, isLinkKind, isSkillKind } from './cvCatalogs'
import type { LinkKind, SkillKind } from './cvCatalogs'

/** CV normalizado (HU-S3-01). `public` es lo que verán las empresas; `protected`, solo la institución. */
export interface CvSkill { id: number; name: string; kind: SkillKind }
export interface CvLanguage { language_code: string; level: number }
export interface CvCertification { id: number; name: string; issuer: string; issued_on: string; expires_on: string | null; verified_at: string | null }
export interface CvProject { id: number; title: string; description: string; role: string | null; year: number | null }
export interface CvLink { id: number; kind: LinkKind; url: string }
export interface CvCredential { certification_id: number; credential_id: string | null; credential_url: string | null; verifiable: boolean }
export interface CvReview { certification_id: number; verified_by: string | null }

export interface StudentCv {
  public: { headline: string | null; skills: CvSkill[]; languages: CvLanguage[]; certifications: CvCertification[]; projects: CvProject[] }
  protected: { links: CvLink[]; credentials: CvCredential[]; reviews: CvReview[] }
}

export interface SkillInput { name: string; kind: SkillKind }
export interface CertificationInput {
  id?: number
  name: string
  issuer: string
  issued_on: string
  expires_on: string | null
  credential_id: string | null
  credential_url: string | null
}
export type ProjectInput = Omit<CvProject, 'id'>
export type LinkInput = Omit<CvLink, 'id'>

type Shape = Record<string, unknown>
const isObject = (value: unknown): value is Shape => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isNullableText = (value: unknown): value is string | null => value === null || isText(value)

function list<T>(value: unknown, parse: (item: Shape) => T | null): T[] {
  if (!Array.isArray(value)) throw new ApiError(502)
  return value.map((item) => {
    const parsed = isObject(item) ? parse(item) : null
    if (parsed === null) throw new ApiError(502)
    return parsed
  })
}

// Cada parser conserva solo los campos del contrato.
const skill = (item: Shape): CvSkill | null =>
  isId(item.id) && isText(item.name) && isSkillKind(item.kind) ? { id: item.id, name: item.name, kind: item.kind } : null
const language = (item: Shape): CvLanguage | null =>
  isCvLanguage(item.language_code) && isLanguageLevel(item.level) ? { language_code: item.language_code, level: item.level } : null
const certification = (item: Shape): CvCertification | null =>
  isId(item.id) && isText(item.name) && isText(item.issuer) && isText(item.issued_on) && isNullableText(item.expires_on) && isNullableText(item.verified_at)
    ? { id: item.id, name: item.name, issuer: item.issuer, issued_on: item.issued_on, expires_on: item.expires_on, verified_at: item.verified_at } : null
const project = (item: Shape): CvProject | null =>
  isId(item.id) && isText(item.title) && isText(item.description) && isNullableText(item.role) &&
  (item.year === null || (typeof item.year === 'number' && Number.isSafeInteger(item.year)))
    ? { id: item.id, title: item.title, description: item.description, role: item.role, year: item.year } : null
const link = (item: Shape): CvLink | null =>
  isId(item.id) && isLinkKind(item.kind) && isText(item.url) ? { id: item.id, kind: item.kind, url: item.url } : null
const credential = (item: Shape): CvCredential | null =>
  isId(item.certification_id) && isNullableText(item.credential_id) && isNullableText(item.credential_url) && typeof item.verifiable === 'boolean'
    ? { certification_id: item.certification_id, credential_id: item.credential_id, credential_url: item.credential_url, verifiable: item.verifiable } : null
const review = (item: Shape): CvReview | null =>
  isId(item.certification_id) && isNullableText(item.verified_by) ? { certification_id: item.certification_id, verified_by: item.verified_by } : null

function cv(response: unknown): StudentCv {
  if (!isObject(response) || !isObject(response.data) || !isObject(response.data.public) || !isObject(response.data.protected)) throw new ApiError(502)
  const { public: shown, protected: hidden } = response.data
  if (!isNullableText(shown.headline)) throw new ApiError(502)
  return {
    public: {
      headline: shown.headline,
      skills: list(shown.skills, skill),
      languages: list(shown.languages, language),
      certifications: list(shown.certifications, certification),
      projects: list(shown.projects, project),
    },
    protected: { links: list(hidden.links, link), credentials: list(hidden.credentials, credential), reviews: list(hidden.reviews, review) },
  }
}

const cvPath = (id: number | string) => `/api/students/${encodeURIComponent(String(id))}/cv`

async function put(id: number, section: string, body: unknown): Promise<StudentCv> {
  // CSRF antes de cada escritura; el envío no se repite automáticamente ante fallos de red.
  await request('/sanctum/csrf-cookie')
  return cv(await request(`${cvPath(id)}/${section}`, { method: 'PUT', body: JSON.stringify(body) }))
}

export async function getCv(id: number | string, signal?: AbortSignal): Promise<StudentCv> {
  return cv(await request(cvPath(id), { signal }))
}

export const updateHeadline = (id: number, headline: string | null) => put(id, 'headline', { headline })
export const updateSkills = (id: number, skills: SkillInput[]) =>
  put(id, 'skills', { skills: skills.map(({ name, kind }) => ({ name, kind })) })
export const updateLanguages = (id: number, languages: CvLanguage[]) =>
  put(id, 'languages', { languages: languages.map(({ language_code, level }) => ({ language_code, level })) })
export const updateCertifications = (id: number, certifications: CertificationInput[]) =>
  put(id, 'certifications', {
    certifications: certifications.map((item) => ({
      ...(item.id ? { id: item.id } : {}), name: item.name, issuer: item.issuer, issued_on: item.issued_on,
      expires_on: item.expires_on, credential_id: item.credential_id, credential_url: item.credential_url,
    })),
  })
export const updateProjects = (id: number, projects: ProjectInput[]) =>
  put(id, 'projects', { projects: projects.map(({ title, description, role, year }) => ({ title, description, role, year })) })
export const updateLinks = (id: number, links: LinkInput[]) =>
  put(id, 'links', { links: links.map(({ kind, url }) => ({ kind, url })) })

export async function setCertificationReview(id: number, certificationId: number, verified: boolean): Promise<StudentCv> {
  await request('/sanctum/csrf-cookie')
  return cv(await request(`${cvPath(id)}/certifications/${encodeURIComponent(String(certificationId))}/verification`, {
    method: 'PATCH', body: JSON.stringify({ verified }),
  }))
}

/** Autocompletar del catálogo compartido de habilidades. */
export async function searchSkills(query: string, signal?: AbortSignal): Promise<CvSkill[]> {
  const response = await request(`/api/skills?q=${encodeURIComponent(query)}`, { signal })
  if (!isObject(response)) throw new ApiError(502)
  return list(response.data, skill)
}

/** Lo que hay que enviar para conservar una certificación tal como está (con su credencial). */
export function certificationInput(certification: CvCertification, credentials: CvCredential[]): CertificationInput {
  const credential = credentials.find((item) => item.certification_id === certification.id)
  return {
    id: certification.id, name: certification.name, issuer: certification.issuer, issued_on: certification.issued_on,
    expires_on: certification.expires_on, credential_id: credential?.credential_id ?? null, credential_url: credential?.credential_url ?? null,
  }
}
