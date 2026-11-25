import { useCallback } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { isLinkKind, linkKindLabel } from '../students/cvCatalogs'
import { LoadingState } from '../ui/StateMessage'
import type { LinkageStatus } from './api'
import { getSharedProfile } from './disclosureApi'
import type { SharedProfile } from './disclosureApi'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

const UNAVAILABLE = 'Ficha profesional no disponible. La institución aún no ha compartido la ficha ampliada de este alumno. Si necesitas revisar su portafolio o certificaciones, solicítalo desde el apartado de mensajes.'

function Profile({ profile }: { profile: SharedProfile }) {
  return (
    <div className="shared-profile">
      <p className="notice-muted">Compartida el {dateFormat.format(new Date(profile.disclosed_at))}.</p>
      <dl className="student-identity">
        {profile.fields.includes('full_name') && <><dt>Nombre completo</dt><dd>{profile.full_name ?? 'Sin capturar'}</dd></>}
        {profile.links && <>
          <dt>Enlaces y portafolio</dt>
          <dd>{profile.links.length ? (
            <ul>
              {profile.links.map((link) => (
                <li key={link.url}>
                  {isLinkKind(link.kind) ? `${linkKindLabel(link.kind)}: ` : ''}
                  <a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>
                </li>
              ))}
            </ul>
          ) : 'Sin enlaces'}</dd>
        </>}
        {profile.credentials && <>
          <dt>Credenciales de certificaciones</dt>
          <dd>{profile.credentials.length ? (
            <ul>
              {profile.credentials.map((credential) => (
                <li key={`${credential.name}-${credential.issuer}`}>
                  {credential.name} ({credential.issuer})
                  {credential.credential_id && <> · ID {credential.credential_id}</>}
                  {credential.credential_url && <> · <a href={credential.credential_url} target="_blank" rel="noopener noreferrer">Verificar</a></>}
                </li>
              ))}
            </ul>
          ) : 'Sin credenciales'}</dd>
        </>}
      </dl>
      <p className="shared-profile-footer">Información compartida exclusivamente para fines de evaluación en Educación Dual.</p>
    </div>
  )
}

function SharedProfileLoader({ linkageId }: { linkageId: number }) {
  const load = useCallback((signal: AbortSignal) => getSharedProfile(linkageId, signal), [linkageId])
  const { data, loading, failure, refresh } = useApiRequest(load)
  if (loading) return <LoadingState label="Cargando ficha…" variant="details" />
  if (failure) return <InstitutionRequestError failure={failure} retry={refresh} />
  return data ? <Profile profile={data} /> : <p className="notice-muted">{UNAVAILABLE}</p>
}

/**
 * T-S19-06: ficha que la institución compartió (D1), solo en una vinculación aceptada. Sin compartir o tras dejar de
 * compartirla, un bloque neutro que sugiere pedirla por los mensajes. Los datos se leen en vivo del servidor.
 */
export function SharedProfileSection({ linkageId, status, sharedAt }: { linkageId: number; status: LinkageStatus; sharedAt: string | null | undefined }) {
  if (status !== 'ACEPTADA') return null
  return (
    <section className="student-section" aria-labelledby="linkage-shared-profile-title">
      <h3 id="linkage-shared-profile-title">{sharedAt ? 'Ficha profesional compartida' : 'Ficha profesional'}</h3>
      {sharedAt ? <SharedProfileLoader key={sharedAt} linkageId={linkageId} /> : <p className="notice-muted">{UNAVAILABLE}</p>}
    </section>
  )
}
