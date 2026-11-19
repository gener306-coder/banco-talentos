import { useNavigate } from 'react-router'
import { ProfileIncompleteNotice } from '../account/ProfileIncompleteNotice'
import { useAuth } from '../auth/useAuth'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { LoadingState } from '../ui/StateMessage'
import { createOpportunity, getOpportunityDefaults, opportunityMessages } from './api'
import { OpportunityForm } from './OpportunityForm'
import { OpportunityLayout } from './OpportunityLayout'

export function OpportunityCreatePage() {
  const navigate = useNavigate()
  const { pending, failure, submit } = useApiMutation(opportunityMessages)
  // La ubicación de la empresa solo precarga el formulario (CA-05): si no llega, se captura a mano.
  const defaults = useApiRequest(getOpportunityDefaults, opportunityMessages)
  // HU-S14-03 CA-05 (M1): sin el mínimo del perfil, en lugar del formulario se explica qué falta.
  const { user } = useAuth()
  const canOperate = user?.company?.canOperate ?? true

  return (
    <OpportunityLayout title="Nueva oportunidad" back={{ to: '/opportunities', label: 'Volver a oportunidades' }}>
      {!canOperate ? <ProfileIncompleteNotice />
        : <p>La oportunidad se registrará en estado ACTIVA.</p>}
      {!canOperate ? null : defaults.loading ? <LoadingState label="Preparando el formulario…" variant="details" />
        : (
          <OpportunityForm defaults={defaults.data} pending={pending} failure={failure} submitLabel="Registrar oportunidad" cancelTo="/opportunities"
            onSubmit={(input) => submit(() => createOpportunity(input), (opportunity) => {
              void navigate(`/opportunities/${opportunity.id}`, { replace: true, state: { notice: 'Oportunidad registrada correctamente.' } })
            })} />
        )}
    </OpportunityLayout>
  )
}
