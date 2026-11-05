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
import type { InsuranceType, SocialSecurity, SocialSecurityInput } from './socialSecurity'

const DOWNLOAD_NAME = 'comprobante-seguro.pdf'
const INSURANCE_TYPES: { value: InsuranceType; label: string }[] = [
  { value: 'IMSS', label: 'IMSS' },
  { value: 'OTHER', label: 'Otro seguro (ISSSTE, privado u otro)' },
]
// Solo un comprobante borrado del disco llega aquí como 404: el alumno ya se cargó.
const downloadMessages: FailureMessages = { ...studentMessages, 404: 'No encontramos el comprobante. Vuelve a subirlo.' }
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })

function InsuranceForm({ studentId, saved, type, onTypeChange, onSaved }: {
  studentId: number
  saved: SocialSecurity
  type: InsuranceType
  onTypeChange: (value: InsuranceType) => void
  onSaved: (value: SocialSecurity) => void
}) {
  const [digits, setDigits] = useState(saved.nss ?? '')
  const [insurer, setInsurer] = useState(saved.insurer_name ?? '')
  const [policy, setPolicy] = useState(saved.policy_number ?? '')
  const [localErrors, setLocalErrors] = useState<Partial<Record<'nss' | 'insurer_name', string>>>({})
  const [notice, setNotice] = useState(false)
  const mutation = useApiMutation(studentMessages)
  const serverError = (field: string) => mutation.failure?.errors[field]?.join(' ') ?? null
  const nssError = localErrors.nss ?? serverError('nss')
  const insurerError = localErrors.insurer_name ?? serverError('insurer_name')
  const policyError = serverError('policy_number')
  const changing = type !== saved.insurance_type &&
    Boolean(saved.nss || saved.insurer_name || saved.policy_number || saved.document)

  function changed() {
    setLocalErrors({})
    setNotice(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setNotice(false)
    const errors: typeof localErrors = {}
    if (type === 'OTHER') {
      if (!insurer.trim()) errors.insurer_name = 'El nombre de la aseguradora es obligatorio.'
    } else if (digits === '') {
      // Igual que el servidor: basta el comprobante, y quien cambia desde otro seguro puede capturar el NSS después.
      if (saved.insurance_type === 'IMSS' && !saved.document) errors.nss = 'Captura el NSS o sube el comprobante.'
    } else if (digits.length !== NSS_LENGTH) errors.nss = 'El NSS debe tener 11 dígitos.'
    else if (!isValidNss(digits)) errors.nss = 'El dígito verificador del NSS no es válido. Revisa que esté bien escrito.'
    setLocalErrors(errors)
    if (Object.keys(errors).length) return
    const input: SocialSecurityInput = type === 'OTHER'
      ? { insurance_type: 'OTHER', insurer_name: insurer.trim(), policy_number: policy.trim() || null }
      : { insurance_type: 'IMSS', nss: digits || null }
    await mutation.submit(() => updateSocialSecurity(studentId, input), (updated) => {
      setDigits(updated.nss ?? '')
      setInsurer(updated.insurer_name ?? '')
      setPolicy(updated.policy_number ?? '')
      setNotice(true)
      onSaved(updated)
    })
  }

  return (
    <form className="social-security-form" onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
      {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
      <fieldset className="choice-group" disabled={mutation.pending}>
        <legend>Tipo de seguro</legend>
        {INSURANCE_TYPES.map(({ value, label }) => (
          <div key={value}>
            <input id={`student-insurance-${value}`} type="radio" name="insurance_type" value={value}
              checked={type === value} onChange={() => { onTypeChange(value); changed() }} />
            <label htmlFor={`student-insurance-${value}`}>{label}</label>
          </div>
        ))}
      </fieldset>
      {changing && <p className="field-hint">Al guardar se borrarán el número y la aseguradora del seguro anterior. El comprobante se conserva hasta que lo reemplaces.</p>}
      {type === 'IMSS'
        ? (
          <>
            <label htmlFor="student-nss">Número de Seguridad Social (NSS)</label>
            <input id="student-nss" name="nss" type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
              className="mono" placeholder="0000 0000 000" disabled={mutation.pending}
              value={formatNss(digits)} aria-invalid={Boolean(nssError)}
              aria-describedby={nssError ? 'student-nss-hint student-nss-error' : 'student-nss-hint'}
              onChange={(event) => { setDigits(nssDigits(event.target.value)); changed() }} />
            <p className="field-hint" id="student-nss-hint">
              {digits.length} de {NSS_LENGTH} dígitos{digits.length === NSS_LENGTH && isValidNss(digits) ? ' · dígito verificador correcto' : ''}
            </p>
            {nssError && <p className="field-error" id="student-nss-error">{nssError}</p>}
          </>
        )
        : (
          <>
            <label htmlFor="student-insurer">Aseguradora o institución</label>
            <input id="student-insurer" name="insurer_name" type="text" autoComplete="off" maxLength={120} required
              placeholder="Por ejemplo: ISSSTE o el nombre de la aseguradora" disabled={mutation.pending}
              value={insurer} aria-invalid={Boolean(insurerError)} aria-describedby={insurerError ? 'student-insurer-error' : undefined}
              onChange={(event) => { setInsurer(event.target.value); changed() }} />
            {insurerError && <p className="field-error" id="student-insurer-error">{insurerError}</p>}
            <label htmlFor="student-policy">Número de póliza o afiliación (opcional)</label>
            <input id="student-policy" name="policy_number" type="text" autoComplete="off" spellCheck={false} maxLength={40} disabled={mutation.pending}
              value={policy} aria-invalid={Boolean(policyError)}
              aria-describedby={policyError ? 'student-policy-hint student-policy-error' : 'student-policy-hint'}
              onChange={(event) => { setPolicy(event.target.value); changed() }} />
            <p className="field-hint" id="student-policy-hint">Si no tiene un número, sube el comprobante en PDF.</p>
            {policyError && <p className="field-error" id="student-policy-error">{policyError}</p>}
          </>
        )}
      {notice && <p className="institution-success" role="status">Seguro guardado correctamente.</p>}
      <div className="actions">
        <button type="submit" disabled={mutation.pending}>
          <PendingLabel pending={mutation.pending} label="Guardar seguro" pendingLabel="Guardando seguro…" />
        </button>
      </div>
    </form>
  )
}

function DocumentForm({ studentId, security, unsavedType, onSaved }: {
  studentId: number
  security: SocialSecurity
  unsavedType: boolean
  onSaved: (value: SocialSecurity) => void
}) {
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
      setLocalError('Selecciona el comprobante de vigencia del seguro.')
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
      {unsavedType
        // El comprobante pertenece al seguro guardado: elegir otro tipo no debe asociarlo al anterior.
        ? <p className="notice-muted">Guarda primero los datos del seguro para subir su comprobante.</p>
        : (
          <>
            <label htmlFor="student-insurance-document">{current ? 'Reemplazar por otro PDF' : 'Archivo PDF'}</label>
            <input key={inputKey} ref={input} id="student-insurance-document" name="document" type="file" accept="application/pdf,.pdf"
              disabled={upload.pending} aria-invalid={Boolean(error)}
              aria-describedby={error ? 'student-insurance-document-hint student-insurance-document-error' : 'student-insurance-document-hint'}
              onChange={(event) => choose(event.target.files?.[0] ?? null)} />
            <p className="field-hint" id="student-insurance-document-hint">Solo PDF, hasta 2 MB.</p>
            {error && <p className="field-error" id="student-insurance-document-error">{error}</p>}
            {notice && <p className="institution-success" role="status">Comprobante guardado correctamente.</p>}
            <div className="actions">
              <button type="submit" disabled={upload.pending}>
                <PendingLabel pending={upload.pending} label={current ? 'Reemplazar comprobante' : 'Subir comprobante'} pendingLabel="Subiendo comprobante…" />
              </button>
            </div>
          </>
        )}
    </form>
  )
}

function InsuranceForms({ studentId, security, onSaved }: { studentId: number; security: SocialSecurity; onSaved: (value: SocialSecurity) => void }) {
  const [type, setType] = useState(security.insurance_type)
  return (
    <div className="social-security">
      <InsuranceForm studentId={studentId} saved={security} type={type} onTypeChange={setType} onSaved={onSaved} />
      <DocumentForm studentId={studentId} security={security} unsavedType={type !== security.insurance_type} onSaved={onSaved} />
    </div>
  )
}

/**
 * Seguro del alumno (HU-S3-02, T-S8-07): IMSS u otro seguro, con su número o su comprobante. Se carga aparte
 * del detalle, porque nunca forma parte del expediente ni de lo que verán las empresas.
 */
export function StudentSocialSecuritySection({ studentId, onSaved }: { studentId: number; onSaved?: () => void }) {
  const load = useCallback((signal: AbortSignal) => getSocialSecurity(studentId, signal), [studentId])
  const { data, loading, failure, refresh, setData } = useApiRequest(load, studentMessages)

  return (
    <section className="student-section" aria-labelledby="student-social-security-title">
      <h3 id="student-social-security-title">Seguro del alumno</h3>
      <p>Registra el IMSS u otro seguro, como ISSSTE o uno privado. Basta con capturar el número o subir el comprobante en PDF.</p>
      <p className="privacy-note">Estos datos son de resguardo exclusivo de tu institución. Nunca se muestran a las empresas ni en el perfil público.</p>
      {loading ? <LoadingState label="Cargando seguro…" variant="details" />
        : failure ? <InstitutionRequestError failure={failure} retry={refresh} />
        : data && <InsuranceForms studentId={studentId} security={data} onSaved={(updated) => { setData(updated); onSaved?.() }} />}
    </section>
  )
}
