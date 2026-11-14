import { useState } from 'react'
import type { ReactNode } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import type { ApiFailure } from '../lib/useApiRequest'
import type { OpportunityOption } from '../opportunities/api'
import { OPPORTUNITY_CONTACT_MESSAGE } from '../opportunities/OpportunityForm'
import { hasContactInformation } from '../students/cvCatalogs'
import { PendingLabel } from '../ui/forms'
import { PlusIcon } from '../ui/icons'
import { LoadingState } from '../ui/StateMessage'
import { createLinkageRequest, LINKAGE_MESSAGE_LIMIT, linkageMessages } from './api'
import { blockingLabels } from './availability'
import type { OpportunityAvailability } from './availability'

type Field = 'opportunity_id' | 'message'

/** Oportunidades activas de la empresa tal como las carga el perfil (useApiRequest). */
export interface OpportunityOptions {
  data: OpportunityOption[] | null
  loading: boolean
  failure: ApiFailure | null
  refresh: () => Promise<void>
}

/**
 * Solicitud de vinculación desde el perfil anónimo (HU-S5-04 CA-06): una de las oportunidades activas de la empresa
 * y un mensaje opcional. Va directo a la institución del alumno; nunca revela su identidad a la empresa.
 * T-S12-07: las oportunidades con una solicitud pendiente, aceptada o rechazada para este perfil aparecen deshabilitadas
 * con su motivo; el perfil carga las opciones y calcula la disponibilidad (linkage/availability.ts).
 */
export function LinkageRequestForm({ publicId, options, availability, onSent }: {
  publicId: string
  options: OpportunityOptions
  /** null mientras no se conocen las solicitudes previas: todas las opciones se ofrecen y decide el backend. */
  availability: readonly OpportunityAvailability[] | null
  onSent?: () => void
}) {
  const items: readonly OpportunityAvailability[] = availability ?? (options.data ?? []).map((option) => ({ option, blockedBy: null }))
  const allBlocked = items.length > 0 && items.every((item) => item.blockedBy !== null)
  const mutation = useApiMutation(linkageMessages)
  const [opportunityId, setOpportunityId] = useState('')
  const [message, setMessage] = useState('')
  const [localErrors, setLocalErrors] = useState<Partial<Record<Field, string>>>({})
  const [sent, setSent] = useState<ReactNode>(null)
  const errors: Partial<Record<Field, string>> = {
    opportunity_id: localErrors.opportunity_id ?? mutation.failure?.errors.opportunity_id?.join(' '),
    message: localErrors.message ?? mutation.failure?.errors.message?.join(' '),
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSent(null)
    const text = message.trim()
    const found: Partial<Record<Field, string>> = {}
    if (!opportunityId) found.opportunity_id = 'Elige una de tus oportunidades activas.'
    if (hasContactInformation(text)) found.message = OPPORTUNITY_CONTACT_MESSAGE
    setLocalErrors(found)
    if (Object.keys(found).length) return

    await mutation.submit(
      () => createLinkageRequest({ student_public_id: publicId, opportunity_id: Number(opportunityId), message: text || null }),
      (linkage) => {
        setSent(<>Solicitud enviada a la institución del alumno para <strong className="notice-subject">{linkage.opportunity.title}</strong>. Queda pendiente de su respuesta.</>)
        setOpportunityId('')
        setMessage('')
        onSent?.()
      },
    )
  }

  const describedBy = (field: Field, extra?: string) => [extra, errors[field] ? `linkage-${field}-error` : null].filter(Boolean).join(' ') || undefined

  return (
    <section className="linkage-request" aria-labelledby="linkage-request-title">
      <h3 id="linkage-request-title">Solicitar vinculación</h3>
      <p>La solicitud llega directamente a la institución del alumno, que decidirá si la acepta. Tu empresa no recibirá sus datos personales.</p>
      {options.loading ? <LoadingState label="Cargando tus oportunidades…" variant="details" />
        : options.failure ? <InstitutionRequestError failure={options.failure} retry={options.refresh} />
        : options.data && options.data.length === 0
          ? (
            <div className="linkage-empty">
              <p className="notice-muted">Tu empresa aún no tiene oportunidades activas. Registra una para poder solicitar la vinculación.</p>
              <Link className="institution-button" to="/opportunities/new"><PlusIcon />Registrar una oportunidad</Link>
            </div>
          )
        : options.data && allBlocked
          ? (
            <>
              {sent && <p className="institution-success" role="status">{sent}</p>}
              <p className="notice-muted">Ya solicitaste este perfil para todas tus oportunidades activas. Registra otra oportunidad para enviar una nueva solicitud.</p>
            </>
          )
        : options.data && (
          <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
            {sent && <p className="institution-success" role="status">{sent}</p>}
            {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
            <fieldset disabled={mutation.pending}>
              <legend className="visually-hidden">Datos de la solicitud</legend>
              <label htmlFor="linkage-opportunity_id">Oportunidad</label>
              <select id="linkage-opportunity_id" name="opportunity_id" required value={opportunityId}
                aria-invalid={Boolean(errors.opportunity_id)} aria-describedby={describedBy('opportunity_id')}
                onChange={(event) => { setOpportunityId(event.target.value); setLocalErrors((current) => ({ ...current, opportunity_id: undefined })) }}>
                <option value="">Selecciona…</option>
                {items.map(({ option, blockedBy }) => (
                  <option key={option.id} value={option.id} disabled={blockedBy !== null}>
                    {option.title}{option.municipality && ` · ${option.municipality}`}{blockedBy && ` · ${blockingLabels[blockedBy]}`}
                  </option>
                ))}
              </select>
              {errors.opportunity_id && <p className="field-error" id="linkage-opportunity_id-error">{errors.opportunity_id}</p>}

              <label htmlFor="linkage-message">Mensaje para la institución (opcional)</label>
              <textarea id="linkage-message" name="message" rows={4} maxLength={LINKAGE_MESSAGE_LIMIT} value={message}
                aria-invalid={Boolean(errors.message)} aria-describedby={describedBy('message', 'linkage-message-count')}
                onChange={(event) => { setMessage(event.target.value); setLocalErrors((current) => ({ ...current, message: undefined })) }}
                onBlur={() => { if (hasContactInformation(message)) setLocalErrors((current) => ({ ...current, message: OPPORTUNITY_CONTACT_MESSAGE })) }} />
              <p className="field-hint" id="linkage-message-count">{message.length} de {LINKAGE_MESSAGE_LIMIT} caracteres · sin enlaces, correos ni teléfonos</p>
              {errors.message && <p className="field-error" id="linkage-message-error">{errors.message}</p>}
            </fieldset>
            <div className="actions">
              <button type="submit" disabled={mutation.pending}>
                <PendingLabel pending={mutation.pending} label="Enviar solicitud" pendingLabel="Enviando solicitud…" />
              </button>
            </div>
          </form>
        )}
    </section>
  )
}
