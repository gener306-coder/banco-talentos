import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { linkageMessages, listLinkageRequests } from '../linkage/api'
import { linkageAvailability } from '../linkage/availability'
import { LinkageRequestForm } from '../linkage/LinkageRequestForm'
import { LinkageStatus } from '../linkage/LinkageStatus'
import { useApiRequest } from '../lib/useApiRequest'
import { listOpportunityOptions, opportunityMessages } from '../opportunities/api'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { useBackLink } from '../ui/backLink'
import { Callout } from '../ui/Callout'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/StateMessage'
import { getTalent, talentMessages } from './api'
import { SkillChips, TalentFacts } from './TalentCardView'
import '../institutions/institutions.css'
import './talent.css'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' })
const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`))

/**
 * Perfil público de un alumno (HU-S4-05 CA-06): el CV público completo. Su única acción es **Solicitar vinculación**
 * (HU-S5-04), que va directo a la institución; no hay «Contactar» ni datos de contacto del alumno.
 */
function TalentProfile({ publicId }: { publicId: string }) {
  const load = useCallback((signal: AbortSignal) => getTalent(publicId, signal), [publicId])
  const { data, loading, failure, refresh } = useApiRequest(load, talentMessages)
  // HU-S5-05 CA-04: solicitudes que la empresa ya envió para este perfil. Si fallan, el perfil se muestra igual.
  const loadSent = useCallback((signal: AbortSignal) => listLinkageRequests({ publicId }, signal), [publicId])
  const sent = useApiRequest(loadSent, linkageMessages)
  // T-S12-07: las oportunidades activas se cargan con el perfil para saber si queda alguna disponible. La regla es por
  // oportunidad (como en el backend): una solicitud pendiente, aceptada o rechazada bloquea solo la suya.
  const options = useApiRequest(listOpportunityOptions, opportunityMessages)
  const availability = options.data && sent.data ? linkageAvailability(options.data, sent.data.items) : null
  // Sin datos para decidir (cargando o con error) el botón se ofrece: el formulario y el backend tienen la última palabra.
  const exhausted = availability !== null && availability.items.length > 0 && availability.eligible === 0
  const [requesting, setRequesting] = useState(false)
  // La hoja monta el formulario al abrirse por primera vez y conserva lo escrito al cerrarla.
  const [requested, setRequested] = useState(false)
  // T-S12-04: desde la bandeja de solicitudes se regresa a ella; desde el buscador (o sin origen), al buscador.
  const back = useBackLink({ to: '/talent', label: 'Volver al buscador' })

  return (
    <section className="card institutions talent-profile" aria-labelledby="talent-profile-title">
      <nav className="institution-navigation" aria-label="Navegación del perfil">
        <Link className="plain" to={back.to} state={back.state}><ChevronLeftIcon />{back.label}</Link>
      </nav>
      {loading ? <LoadingState label="Cargando perfil…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            <h2 id="talent-profile-title">{data.headline ?? 'Perfil sin titular'}</h2>
            <p className="privacy-note">Perfil anónimo: la identidad del alumno y sus datos de contacto los resguarda su institución.</p>
            {sent.data && sent.data.items.length > 0 && (
              <Callout tone="info" label="Solicitudes enviadas para este perfil"
                action={<Link className="pill-link" to="/linkage-requests">Ver tus solicitudes<ChevronRightIcon /></Link>}>
                <p>{exhausted ? 'Ya solicitaste este perfil para todas tus oportunidades activas:' : 'Ya solicitaste la vinculación de este perfil para:'}</p>
                <ul>
                  {sent.data.items.map((item) => (
                    <li key={item.id}><strong className="notice-subject">{item.opportunity.title}</strong> · <LinkageStatus status={item.status} /></li>
                  ))}
                </ul>
              </Callout>
            )}
            {!exhausted && (
              <div className="actions">
                {/* Al abrir la hoja se vuelven a consultar oportunidades y solicitudes: pudieron cambiar en otra pestaña
                    (por ejemplo, una oportunidad recién registrada) desde que se cargó el perfil. */}
                <button type="button" onClick={() => { setRequested(true); setRequesting(true); void options.refresh(); void sent.refresh() }}>
                  Solicitar vinculación
                </button>
              </div>
            )}
            <TalentFacts card={data} />

            <section aria-labelledby="talent-skills-title">
              <h3 id="talent-skills-title">Habilidades</h3>
              {data.skills.length ? <SkillChips skills={data.skills} label="Habilidades" /> : <p className="notice-muted">Sin habilidades registradas.</p>}
            </section>

            <section aria-labelledby="talent-languages-title">
              <h3 id="talent-languages-title">Idiomas</h3>
              {data.languages.length
                ? <ul>{data.languages.map((language) => <li key={language.languageCode}>{languageName(language.languageCode)}: {levelLabel(language.level)}</li>)}</ul>
                : <p className="notice-muted">Sin idiomas registrados.</p>}
            </section>

            <section aria-labelledby="talent-certifications-title">
              <h3 id="talent-certifications-title">Certificaciones</h3>
              {data.certifications.length
                ? (
                  <ul className="cv-cards">
                    {data.certifications.map((certification, index) => (
                      <li key={index} className="cv-card">
                        <p><strong>{certification.name}</strong> · {certification.issuer}</p>
                        <p>Emitida el {formatDate(certification.issuedOn)}{certification.expiresOn && ` · vence el ${formatDate(certification.expiresOn)}`}</p>
                        <p><span className={`institution-status ${certification.verified ? 'active' : 'inactive'}`}>
                          {certification.verified ? 'Revisada por la institución' : 'Sin revisar'}
                        </span></p>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="notice-muted">Sin certificaciones registradas.</p>}
            </section>

            <section aria-labelledby="talent-projects-title">
              <h3 id="talent-projects-title">Proyectos</h3>
              {data.projects.length
                ? (
                  <ul className="cv-cards">
                    {data.projects.map((project, index) => (
                      <li key={index} className="cv-card">
                        <p><strong>{project.title}</strong>{project.year && ` · ${project.year}`}{project.role && ` · ${project.role}`}</p>
                        <p>{project.description}</p>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="notice-muted">Sin proyectos registrados.</p>}
            </section>
            <Sheet open={requesting} onClose={() => setRequesting(false)} labelledBy="linkage-request-title">
              {requested && <LinkageRequestForm publicId={publicId} options={options} availability={availability?.items ?? null} onSent={() => { void sent.refresh() }} />}
            </Sheet>
          </>
        )}
    </section>
  )
}

export function TalentProfilePage() {
  const { publicId = '' } = useParams()
  return <TalentProfile key={publicId} publicId={publicId} />
}
