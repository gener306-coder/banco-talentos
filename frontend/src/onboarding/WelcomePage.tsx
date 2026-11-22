import { useCallback } from 'react'
import { Navigate } from 'react-router'
import { CompanyProfileForm } from '../account/CompanyProfileForm'
import { InstitutionProfileForm } from '../account/OrganizationProfileSection'
import { getOrganizationProfile, postponeOnboarding } from '../account/organizationApi'
import '../account/account.css'
import { useAuth } from '../auth/useAuth'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation, useApiRequest } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { LoadingState } from '../ui/StateMessage'

/**
 * Onboarding de la organización invitada (HU-S14-03 CA-02; HU-S16-07 lo extiende a la institución): una vista limpia para
 * capturar el perfil al entrar por primera vez. Guarda en parcial o se pospone; en ambos casos el onboarding termina y
 * la organización sigue al inicio, donde el recordatorio la acompaña mientras falten datos. Con el onboarding terminado,
 * esta ruta lleva al inicio.
 */
export function WelcomePage() {
  const { user, updateUser } = useAuth()
  const load = useCallback((signal: AbortSignal) => getOrganizationProfile(signal), [])
  const profile = useApiRequest(load)
  const postpone = useApiMutation()
  // Al guardar o posponer, la sesión pasa a «done» y esta misma comprobación lleva al inicio: sin bucles.
  const organization = user?.role === 'COMPANY' ? user.company : user?.role === 'INSTITUTION' ? user.institution : null
  if (!user || !organization || organization.onboarding === 'done') return <Navigate to="/" replace />
  const institution = user.role === 'INSTITUTION'

  function later() {
    void postpone.submit(postponeOnboarding, () => {
      if (!user) return
      if (user.company) updateUser({ ...user, company: { ...user.company, onboarding: 'done' } })
      if (user.institution) updateUser({ ...user, institution: { ...user.institution, onboarding: 'done' } })
    })
  }

  const secondary = (
    <button type="button" className="secondary" disabled={postpone.pending} onClick={later}>
      <PendingLabel pending={postpone.pending} label="Completar más tarde" pendingLabel="Un momento…" />
    </button>
  )

  return (
    <section className="card institutions account-page welcome-page" aria-labelledby="welcome-title">
      <h2 id="welcome-title">{institution ? 'Completa el perfil de tu institución' : 'Completa el perfil de tu empresa'}</h2>
      <p className="welcome-lead">
        {institution
          ? 'Con el nombre oficial, el CCT y el responsable del programa dual, tus alumnos podrán aparecer en la búsqueda de talento, y podrás subir videos y aceptar solicitudes. Puedes guardar lo que tengas ahora y completar el resto después.'
          : 'Con el nombre de tu empresa y tu contacto podrás publicar oportunidades y enviar solicitudes de vinculación. Puedes guardar lo que tengas ahora y completar el resto después.'}
      </p>
      {postpone.failure && <InstitutionRequestError failure={postpone.failure} />}
      {profile.loading && !profile.data ? <LoadingState label="Preparando tu perfil…" variant="details" />
        : profile.failure ? <InstitutionRequestError failure={profile.failure} retry={profile.refresh} page />
        : profile.data?.type === 'company' ? (
          <div className="content-enter">
            <CompanyProfileForm profile={profile.data} submitLabel="Guardar y continuar" pendingLabel="Guardando…" suggestSelf onSaved={() => undefined} secondary={secondary} />
          </div>
        )
        : profile.data?.type === 'institution' && (
          <div className="content-enter">
            {/* HU-S16-07: «Soy yo» solo se propone aquí; en Mi cuenta, un responsable vacío se respeta (T-S14-02). */}
            <InstitutionProfileForm profile={profile.data} submitLabel="Guardar y continuar" pendingLabel="Guardando…" suggestSelf onSaved={() => undefined} secondary={secondary} />
          </div>
        )}
    </section>
  )
}
