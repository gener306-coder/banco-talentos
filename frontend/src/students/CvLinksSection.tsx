import { useState } from 'react'
import type { FormEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { updateLinks } from './cv'
import type { StudentCv } from './cv'
import { CV_LIMITS, isLinkKind, itemErrors, LINK_KINDS, linkKindLabel, linkUrlError } from './cvCatalogs'
import type { LinkKind } from './cvCatalogs'
import { FieldError, ProtectedBadge, ProtectedNote, SaveBar } from './CvShared'
import { studentMessages } from './messages'

type Row = { key: number; kind: LinkKind | ''; url: string }
let nextKey = 0

/** Enlaces externos (HU-S3-01 CA-02): revelan la identidad, así que son datos protegidos. */
export function CvLinksSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const toRows = (source: StudentCv) => source.protected.links.map((link) => ({ key: nextKey++, kind: link.kind, url: link.url }))
  const [rows, setRows] = useState<Row[]>(() => toRows(cv))
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const mutation = useApiMutation(studentMessages)

  function update(key: number, field: 'kind' | 'url', value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row))
    setLocalErrors({})
    setSaved(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSaved(false)
    const errors: Record<string, string> = {}
    const seen = new Set<string>()
    rows.forEach((row, index) => {
      if (!row.kind) errors[`${index}.kind`] = 'Selecciona el tipo de enlace.'
      const url = row.url.trim()
      const urlError = row.kind ? linkUrlError(row.kind, url) : (url ? null : 'Escribe la dirección del enlace.')
      if (urlError) errors[`${index}.url`] = urlError
      else if (seen.has(url.toLowerCase())) errors[`${index}.url`] = 'Este enlace ya está en la lista.'
      seen.add(url.toLowerCase())
    })
    setLocalErrors(errors)
    if (Object.keys(errors).length) return
    const links = rows.flatMap((row) => isLinkKind(row.kind) ? [{ kind: row.kind, url: row.url.trim() }] : [])
    await mutation.submit(() => updateLinks(studentId, links), (updated) => {
      setRows(toRows(updated))
      setSaved(true)
      onSaved(updated)
    })
  }

  const errorFor = (index: number, field: string) => {
    const local = localErrors[`${index}.${field}`]
    return local ? [local] : itemErrors(mutation.failure?.errors, 'links', index, field)
  }

  return (
    <section className="student-section cv-section protected-section" aria-labelledby="cv-links-title">
      <h3 id="cv-links-title">Enlaces externos <ProtectedBadge /></h3>
      <ProtectedNote>GitHub, LinkedIn o un portafolio revelan el nombre y la foto del alumno. Esta información no es visible en la búsqueda general de empresas; solo se compartirá cuando exista un contacto autorizado.</ProtectedNote>
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
        {rows.length === 0 && <p className="notice-muted">Aún no hay enlaces.</p>}
        <fieldset className="cv-rows" disabled={mutation.pending}>
          <legend className="visually-hidden">Enlaces externos</legend>
          {rows.map((row, index) => {
            const label = row.kind ? linkKindLabel(row.kind) : `enlace ${index + 1}`
            const kindError = errorFor(index, 'kind')
            const urlError = errorFor(index, 'url')
            const host = LINK_KINDS.find((kind) => kind.value === row.kind)?.host
            return (
              <div key={row.key} className="cv-row link-row">
                <div>
                  <label htmlFor={`cv-link-kind-${row.key}`}>Tipo del enlace {index + 1}</label>
                  <select id={`cv-link-kind-${row.key}`} value={row.kind} aria-invalid={Boolean(kindError)}
                    aria-describedby={kindError ? `cv-link-kind-${row.key}-error` : undefined}
                    onChange={(event) => update(row.key, 'kind', event.target.value)}>
                    <option value="">Selecciona…</option>
                    {LINK_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                  </select>
                  <FieldError id={`cv-link-kind-${row.key}-error`} messages={kindError} />
                </div>
                <div>
                  <label htmlFor={`cv-link-url-${row.key}`}>Dirección de {label}</label>
                  <input id={`cv-link-url-${row.key}`} type="url" inputMode="url" autoComplete="off" spellCheck={false}
                    placeholder={host ? `https://${host}/…` : 'https://…'} value={row.url} aria-invalid={Boolean(urlError)}
                    aria-describedby={urlError ? `cv-link-url-${row.key}-error` : undefined}
                    onChange={(event) => update(row.key, 'url', event.target.value)} />
                  <FieldError id={`cv-link-url-${row.key}-error`} messages={urlError} />
                </div>
                <button type="button" className="plain row-remove" aria-label={`Quitar ${label}`}
                  onClick={() => { setRows(rows.filter((item) => item.key !== row.key)); setLocalErrors({}); setSaved(false) }}>
                  <CloseIcon />
                </button>
              </div>
            )
          })}
        </fieldset>
        <FieldError id="cv-links-error" messages={mutation.failure?.errors.links} />
        <button type="button" className="secondary" disabled={mutation.pending || rows.length >= CV_LIMITS.links}
          onClick={() => { setRows([...rows, { key: nextKey++, kind: '', url: '' }]); setSaved(false) }}>
          <PlusIcon />Agregar enlace
        </button>
        <SaveBar pending={mutation.pending} saved={saved} label="Guardar enlaces" pendingLabel="Guardando enlaces…" savedLabel="Enlaces guardados correctamente." />
      </form>
    </section>
  )
}
