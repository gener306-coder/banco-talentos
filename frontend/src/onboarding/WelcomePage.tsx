import { useCallback } from 'react'
import { Navigate } from 'react-router'
import { CompanyProfileForm } from '../account/CompanyProfileForm'
import { getOrganizationProfile, postponeOnboarding } from '../account/organizationApi'
import '../account/account.css'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { LoadingState } from '../ui/StateMessage'

/**
 * Onboarding de la empresa invitada (HU-S14-03 CA-02): una vista limpia para capturar el perfil al entrar por primera
 * vez. Guarda en parcial o se pospone; en ambos casos el onboarding termina y la empresa sigue al inicio, donde el
 * recordatorio la acompaña mientras falten datos. Con el onboarding terminado, esta ruta lleva al inicio.
 */
export function WelcomePage() {
  const { user, updateUser } = useAuth()
  const load = useCallback((signal: AbortSignal) => getOrganizationProfile(signal), [])
  const profile = useApiRequest(load)
  const postpone = useApiMutation()
  // Al guardar o posponer, la sesión pasa a «done» y esta misma comprobación lleva al inicio: sin bucles.
  if (!user?.company || user.role !== 'COMPANY' || user.company.onboarding === 'done') return <Navigate to="/" replace />
  const company = user.company

  function later() {
    void postpone.submit(postponeOnboarding, () => {
      if (user) updateUser({ ...user, company: { ...company, onboarding: 'done' } })
    })
  }

  return (
    <section className="card institutions account-page welcome-page" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Completa el perfil de tu empresa</h2>
      <p className="welcome-lead">
        Con el nombre de tu empresa y tu contacto podrás publicar oportunidades y enviar solicitudes de vinculación. Puedes guardar lo que tengas ahora y completar el resto después.
      </p>
      {postpone.failure && <InstitutionRequestError failure={postpone.failure} />}
      {profile.loading && !profile.data ? <LoadingState label="Preparando tu perfil…" variant="details" />
        : profile.failure ? <InstitutionRequestError failure={profile.failure} retry={profile.refresh} page />
        : profile.data?.type === 'company' && (
          <div className="content-enter">
            <CompanyProfileForm profile={profile.data} submitLabel="Guardar y continuar" pendingLabel="Guardando…" onSaved={() => undefined}
              secondary={(
                <button type="button" className="secondary" disabled={postpone.pending} onClick={later}>
                  <PendingLabel pending={postpone.pending} label="Completar más tarde" pendingLabel="Un momento…" />
                </button>
              )} />
          </div>
        )}
    </section>
  )
}
