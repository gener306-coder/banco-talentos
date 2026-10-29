import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { saveBlob } from '../lib/download'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { LoadingState } from '../ui/StateMessage'
import { studentMessages } from './messages'
import {
  downloadSocialSecurityDocument, fileSize, formatNss, getSocialSecurity, isPdfFile, isValidNss, MAX_DOCUMENT_BYTES,
  NSS_LENGTH, nssDigits, updateSocialSecurity, uploadSocialSecurityDocument,
} from './socialSecurity'
import type { SocialSecurity } from './socialSecurity'

const DOWNLOAD_NAME = 'comprobante-imss.pdf'
// Solo un comprobante borrado del disco llega aquí como 404: el alumno ya se cargó.
const downloadMessages: FailureMessages = { ...studentMessages, 404: 'No encontramos el comprobante. Vuelve a subirlo.' }
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })

function NssForm({ studentId, saved, onSaved }: { studentId: number; saved: string | null; onSaved: (value: SocialSecurity) => void }) {
  const [digits, setDigits] = useState(saved ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [notice, setNotice] = useState(false)
  const mutation = useApiMutation(studentMessages)
  const error = localError ?? mutation.failure?.errors.nss?.join(' ') ?? null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setNotice(false)
    const message = digits === '' ? 'El NSS es obligatorio.'
      : digits.length !== NSS_LENGTH ? 'El NSS debe tener 11 dígitos.'
      : !isValidNss(digits) ? 'El dígito verificador del NSS no es válido. Revisa que esté bien escrito.'
      : null
    setLocalError(message)
    if (message) return
    await mutation.submit(() => updateSocialSecurity(studentId, digits), (updated) => {
      setDigits(updated.nss ?? '')
      setNotice(true)
      onSaved(updated)
    })
  }

  return (
    <form className="social-security-form" onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <label htmlFor="student-nss">Número de Seguridad Social (NSS)</label>
      <input id="student-nss" name="nss" type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
        className="mono" placeholder="0000 0000 000" disabled={mutation.pending}
        value={formatNss(digits)} aria-invalid={Boolean(error)}
        aria-describedby={error ? 'student-nss-hint student-nss-error' : 'student-nss-hint'}
        onChange={(event) => { setDigits(nssDigits(event.target.value)); setLocalError(null); setNotice(false) }} />
      <p className="field-hint" id="student-nss-hint">
        {digits.length} de {NSS_LENGTH} dígitos{digits.length === NSS_LENGTH && isValidNss(digits) ? ' · dígito verificador correcto' : ''}
      </p>
      {error && <p className="field-error" id="student-nss-error">{error}</p>}
      {notice && <p className="institution-success" role="status">NSS guardado correctamente.</p>}
      <div className="actions">
        <button type="submit" disabled={mutation.pending}>
          <PendingLabel pending={mutation.pending} label="Guardar NSS" pendingLabel="Guardando NSS…" />
        </button>
      </div>
    </form>
  )
}

function DocumentForm({ studentId, security, onSaved }: { studentId: number; security: SocialSecurity; onSaved: (value: SocialSecurity) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [notice, setNotice] = useState(false)
  // Cambiar la key vacía el selector de archivo tras una subida.
  const [inputKey, setInputKey] = useState(0)
  const upload = useApiMutation(studentMessages)
  const download = useApiMutation(downloadMessages)
  const input = useRef<HTMLInputElement>(null)
  const { document: current } = security
  const error = localError ?? upload.failure?.errors.document?.join(' ') ?? null
  const failure = [upload.failure, download.failure].find((value) => value && value.status !== 422)

  function choose(selected: File | null) {
    setFile(selected)
    setNotice(false)
    setLocalError(selected === null ? null
      : !isPdfFile(selected) ? 'El comprobante debe ser un archivo PDF.'
      : selected.size > MAX_DOCUMENT_BYTES ? 'El comprobante no debe superar 2 MB.'
      : null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (upload.pending) return
    if (!file) {
      setLocalError('Selecciona el comprobante de vigencia del IMSS.')
      input.current?.focus()
      return
    }
    if (localError) return
    await upload.submit(() => uploadSocialSecurityDocument(studentId, file), (updated) => {
      setFile(null)
      setInputKey((key) => key + 1)
      setNotice(true)
      onSaved(updated)
    })
  }

  return (
    <form className="social-security-form" onSubmit={(event) => { void submit(event) }} aria-busy={upload.pending} noValidate>
      <h4>Comprobante de vigencia</h4>
      {failure && <InstitutionRequestError failure={failure} />}
      {current
        ? (
          <div className="document-card">
            <p className="document-name">{current.name}</p>
            <p className="document-meta">{fileSize(current.size)} · Subido el {dateFormat.format(new Date(current.uploaded_at))}</p>
            <button type="button" className="secondary" disabled={download.pending}
              onClick={() => { void download.submit(() => downloadSocialSecurityDocument(studentId), (blob) => saveBlob(blob, DOWNLOAD_NAME)) }}>
              <PendingLabel pending={download.pending} label="Descargar comprobante" pendingLabel="Descargando…" />
            </button>
          </div>
        )
        : <p className="notice-muted">Aún no hay comprobante.</p>}
      <label htmlFor="student-imss-document">{current ? 'Reemplazar por otro PDF' : 'Archivo PDF'}</label>
      <input key={inputKey} ref={input} id="student-imss-document" name="document" type="file" accept="application/pdf,.pdf"
        disabled={upload.pending} aria-invalid={Boolean(error)}
        aria-describedby={error ? 'student-imss-document-hint student-imss-document-error' : 'student-imss-document-hint'}
        onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      <p className="field-hint" id="student-imss-document-hint">Solo PDF, hasta 2 MB.</p>
      {error && <p className="field-error" id="student-imss-document-error">{error}</p>}
      {notice && <p className="institution-success" role="status">Comprobante guardado correctamente.</p>}
      <div className="actions">
        <button type="submit" disabled={upload.pending}>
          <PendingLabel pending={upload.pending} label={current ? 'Reemplazar comprobante' : 'Subir comprobante'} pendingLabel="Subiendo comprobante…" />
        </button>
      </div>
    </form>
  )
}

/**
 * Seguro facultativo del alumno (HU-S3-02): NSS y comprobante del IMSS. Se carga aparte del detalle,
 * porque nunca forma parte del expediente ni de lo que verán las empresas.
 */
export function StudentSocialSecuritySection({ studentId }: { studentId: number }) {
  const load = useCallback((signal: AbortSignal) => getSocialSecurity(studentId, signal), [studentId])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, studentMessages)

  return (
    <section className="student-section" aria-labelledby="student-social-security-title">
      <h3 id="student-social-security-title">Seguro Facultativo (IMSS)</h3>
      <p className="privacy-note">El NSS y el comprobante son de resguardo exclusivo de tu institución. Nunca se muestran a las empresas ni en el perfil público.</p>
      {loading ? <LoadingState label="Cargando seguro facultativo…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && (
          <div className="social-security">
            <NssForm studentId={studentId} saved={data.nss} onSaved={setData} />
            <DocumentForm studentId={studentId} security={data} onSaved={setData} />
          </div>
        )}
    </section>
  )
}
