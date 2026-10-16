import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PendingLabel } from '../ui/forms'
import { CheckIcon, LockIcon, PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { certificationInput, setCertificationReview, updateCertifications } from './cv'
import type { CertificationInput, CvCertification, StudentCv } from './cv'
import { CONTACT_MESSAGE, CV_LIMITS, displayName, hasContactInformation, isSafeHttpsUrl, UNSAFE_URL_MESSAGE } from './cvCatalogs'
import { FieldError, ProtectedNote } from './CvShared'
import { studentMessages } from './messages'

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' })
const reviewFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`))
const today = () => new Date().toLocaleDateString('en-CA')

type Field = 'name' | 'issuer' | 'issued_on' | 'expires_on' | 'credential_id' | 'credential_url'

/** Alta o edición de una certificación en una hoja; la credencial es dato protegido. */
function CertificationForm({ initial, reviewed, pending, serverErrors, onSubmit }: {
  initial: CertificationInput | null
  reviewed: boolean
  pending: boolean
  serverErrors: Partial<Record<Field, string[]>>
  onSubmit: (value: CertificationInput) => void
}) {
  const [values, setValues] = useState({
    name: initial?.name ?? '', issuer: initial?.issuer ?? '', issued_on: initial?.issued_on ?? '', expires_on: initial?.expires_on ?? '',
    credential_id: initial?.credential_id ?? '', credential_url: initial?.credential_url ?? '',
  })
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string>>>({})
  const errorFor = (field: Field) => localErrors[field] ?? serverErrors[field]?.join(' ')

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const name = displayName(values.name)
    const issuer = displayName(values.issuer)
    const url = values.credential_url.trim()
    const errors: Partial<Record<Field, string>> = {}
    if (!name) errors.name = 'Escribe el nombre de la certificación.'
    else if (hasContactInformation(name)) errors.name = CONTACT_MESSAGE
    if (!issuer) errors.issuer = 'Escribe quién emitió la certificación.'
    else if (hasContactInformation(issuer)) errors.issuer = CONTACT_MESSAGE
    if (!values.issued_on) errors.issued_on = 'Indica la fecha de emisión.'
    else if (values.issued_on > today()) errors.issued_on = 'La fecha de emisión no puede ser futura.'
    if (values.expires_on && values.issued_on && values.expires_on < values.issued_on) errors.expires_on = 'La vigencia no puede terminar antes de la fecha de emisión.'
    if (url && !isSafeHttpsUrl(url)) errors.credential_url = UNSAFE_URL_MESSAGE
    setLocalErrors(errors)
    if (Object.keys(errors).length) return
    onSubmit({
      ...(initial?.id ? { id: initial.id } : {}), name, issuer, issued_on: values.issued_on, expires_on: values.expires_on || null,
      credential_id: values.credential_id.trim() || null, credential_url: url || null,
    })
  }

  const input = (field: Field, label: string, props: Record<string, unknown> = {}) => (
    <>
      <label htmlFor={`cv-certification-${field}`}>{label}</label>
      <input id={`cv-certification-${field}`} name={field} autoComplete="off" value={values[field]} aria-invalid={Boolean(errorFor(field))}
        aria-describedby={errorFor(field) ? `cv-certification-${field}-error` : undefined}
        onChange={(event) => set(field, event.target.value)} {...props} />
      <FieldError id={`cv-certification-${field}-error`} messages={errorFor(field)} />
    </>
  )

  return (
    <form onSubmit={submit} aria-busy={pending} noValidate>
      <h2 id="cv-certification-form-title">{initial ? 'Editar certificación' : 'Agregar certificación'}</h2>
      {reviewed && <p className="notice">Esta certificación está revisada. Si cambias sus datos o su credencial, la revisión se quitará y deberás revisarla de nuevo.</p>}
      <fieldset disabled={pending}>
        <legend className="visually-hidden">Datos de la certificación</legend>
        {input('name', 'Nombre de la certificación', { type: 'text', maxLength: 150, placeholder: 'Ej. CCNA, Soporte Vital Básico' })}
        {input('issuer', 'Emisor', { type: 'text', maxLength: 120, placeholder: 'Ej. Cisco, Cruz Roja Mexicana' })}
        <div className="field-row">
          <div>{input('issued_on', 'Fecha de emisión', { type: 'date', max: today() })}</div>
          <div>{input('expires_on', 'Vigente hasta (opcional)', { type: 'date', min: values.issued_on || undefined })}</div>
        </div>
        <div className="protected-fields">
          <ProtectedNote>La credencial lleva a una página con el nombre del alumno: no es visible en la búsqueda general de empresas.</ProtectedNote>
          {input('credential_id', 'ID de la credencial (opcional)', { type: 'text', maxLength: 120 })}
          {input('credential_url', 'URL de verificación (opcional)', { type: 'url', inputMode: 'url', maxLength: 2048, spellCheck: false, placeholder: 'https://www.credly.com/badges/…' })}
        </div>
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={pending}>
          <PendingLabel pending={pending} label={initial ? 'Guardar certificación' : 'Agregar certificación'} pendingLabel="Guardando certificación…" />
        </button>
      </div>
    </form>
  )
}

/** Certificaciones (HU-S3-01 CA-04): la institución, actor de confianza, puede marcarlas como revisadas. */
export function CvCertificationsSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const { certifications } = cv.public
  const { credentials, reviews } = cv.protected
  const save = useApiMutation(studentMessages)
  const review = useApiMutation(studentMessages)
  // El destino se conserva al cerrar la hoja, para que su contenido no desaparezca durante la animación.
  const [target, setTarget] = useState<CvCertification | 'new'>('new')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openings, setOpenings] = useState(0)
  const [removing, setRemoving] = useState<CvCertification | null>(null)
  const removeButton = useRef<HTMLButtonElement | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheetOpen(false), [])
  const current = certifications.map((item) => certificationInput(item, credentials))
  const editingIndex = target !== 'new' ? certifications.findIndex((item) => item.id === target.id) : certifications.length
  const sheetErrors = Object.fromEntries(Object.entries(save.failure?.errors ?? {})
    .filter(([key]) => key.startsWith(`certifications.${editingIndex}.`))
    .map(([key, messages]) => [key.split('.')[2], messages]))

  function open(next: CvCertification | 'new') {
    setNotice(null)
    setOpenings((count) => count + 1)
    setTarget(next)
    setSheetOpen(true)
  }

  async function persist(next: CertificationInput[], message: string, onDone?: () => void) {
    setNotice(null)
    await save.submit(() => updateCertifications(studentId, next), (updated) => {
      onSaved(updated)
      setNotice(message)
      onDone?.()
    })
  }

  function submitForm(value: CertificationInput) {
    const next = target === 'new' ? [...current, value] : current.map((item) => item.id === value.id ? value : item)
    void persist(next, target === 'new' ? 'Certificación agregada correctamente.' : 'Certificación guardada correctamente.', () => setSheetOpen(false))
  }

  async function toggleReview(certification: CvCertification) {
    setNotice(null)
    const verified = certification.verified_at === null
    await review.submit(() => setCertificationReview(studentId, certification.id, verified), (updated) => {
      onSaved(updated)
      setNotice(verified ? `«${certification.name}» quedó revisada por tu institución.` : `Se quitó la revisión de «${certification.name}».`)
    })
  }

  const failure = [save.failure, review.failure].find((value) => value && value.status !== 422) ?? null
  const listError = save.failure?.status === 422 && !sheetOpen ? Object.values(save.failure.errors).flat().join(' ') : null

  return (
    <section className="student-section cv-section" aria-labelledby="cv-certifications-title">
      <h3 id="cv-certifications-title">Certificaciones</h3>
      <p>Las empresas verán el nombre, el emisor, las fechas y si tu institución la revisó.</p>
      {failure && <InstitutionRequestError failure={failure} />}
      {listError && <p className="field-error">{listError}</p>}
      {certifications.length === 0
        ? <p className="notice-muted">Aún no hay certificaciones.</p>
        : (
          <ul className="cv-cards" aria-label="Certificaciones registradas">
            {certifications.map((certification) => {
              const credential = credentials.find((item) => item.certification_id === certification.id)
              const reviewer = reviews.find((item) => item.certification_id === certification.id)?.verified_by
              return (
                <li key={certification.id} className="cv-card">
                  <div className="cv-card-heading">
                    <p className="cv-card-title">{certification.name}</p>
                    {certification.verified_at
                      ? <span className="review-status reviewed"><CheckIcon />Revisada</span>
                      : <span className="review-status pending">Sin revisar</span>}
                  </div>
                  <p className="cv-card-meta">
                    {certification.issuer} · Emitida el {formatDate(certification.issued_on)}
                    {certification.expires_on ? ` · Vigente hasta el ${formatDate(certification.expires_on)}` : ' · Sin vencimiento'}
                  </p>
                  {certification.verified_at && (
                    <p className="cv-card-meta">Revisada {reviewer ? `por ${reviewer} ` : ''}el {reviewFormat.format(new Date(certification.verified_at))}</p>
                  )}
                  {credential && (
                    <p className="credential-line">
                      <LockIcon /><span className="visually-hidden">Protegido: </span>
                      {credential.credential_id && <span>ID {credential.credential_id}</span>}
                      {credential.credential_url && (
                        <a href={credential.credential_url} target="_blank" rel="noopener noreferrer nofollow">
                          {credential.verifiable ? 'Verificar en la plataforma emisora' : 'Ver credencial'}
                        </a>
                      )}
                    </p>
                  )}
                  <div className="actions">
                    <button type="button" className={certification.verified_at ? 'secondary' : undefined} disabled={review.pending || save.pending}
                      aria-label={`${certification.verified_at ? 'Quitar revisión de' : 'Marcar como revisada'} ${certification.name}`}
                      onClick={() => { void toggleReview(certification) }}>
                      {certification.verified_at ? 'Quitar revisión' : 'Marcar como revisada'}
                    </button>
                    <button type="button" className="secondary" disabled={save.pending} aria-label={`Editar ${certification.name}`}
                      onClick={() => open(certification)}>Editar</button>
                    <button type="button" className="plain" disabled={save.pending} aria-label={`Eliminar ${certification.name}`}
                      onClick={(event) => { removeButton.current = event.currentTarget; setRemoving(certification) }}>Eliminar</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      {notice && <p className="institution-success" role="status">{notice}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={save.pending || certifications.length >= CV_LIMITS.certifications}
          onClick={() => open('new')}><PlusIcon />Agregar certificación</button>
      </div>

      <Sheet open={sheetOpen} onClose={close} labelledBy="cv-certification-form-title">
        <CertificationForm key={openings} pending={save.pending} serverErrors={sheetOpen ? sheetErrors : {}}
          initial={target === 'new' ? null : certificationInput(target, credentials)}
          reviewed={target !== 'new' && target.verified_at !== null} onSubmit={submitForm} />
      </Sheet>
      <ConfirmDialog open={removing !== null} origin={removeButton}
        title="¿Eliminar la certificación?"
        description={removing ? `«${removing.name}» y su credencial se eliminarán del CV.` : ''}
        confirmLabel="Eliminar"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing
          setRemoving(null)
          if (target) void persist(current.filter((item) => item.id !== target.id), 'Certificación eliminada.')
        }} />
    </section>
  )
}
