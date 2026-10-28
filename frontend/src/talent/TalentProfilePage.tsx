import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { LinkageRequestForm } from '../linkage/LinkageRequestForm'
import { useApiRequest } from '../lib/useApiRequest'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { ChevronLeftIcon } from '../ui/icons'
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
  const [requesting, setRequesting] = useState(false)
  // La hoja carga las oportunidades al abrirse por primera vez y conserva lo escrito al cerrarla.
  const [requested, setRequested] = useState(false)

  return (
    <section className="card institutions talent-profile" aria-labelledby="talent-profile-title">
      <nav className="institution-navigation" aria-label="Navegación del perfil">
        <Link className="plain" to="/talent"><ChevronLeftIcon />Volver al buscador</Link>
      </nav>
      {loading ? <LoadingState label="Cargando perfil…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
        : data && (
          <>
            <h2 id="talent-profile-title">{data.headline ?? 'Perfil sin titular'}</h2>
            <p className="privacy-note">Perfil anónimo: la identidad del alumno y sus datos de contacto los resguarda su institución.</p>
            <div className="actions">
              <button type="button" onClick={() => { setRequested(true); setRequesting(true) }}>Solicitar vinculación</button>
            </div>
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
              {requested && <LinkageRequestForm publicId={publicId} />}
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
