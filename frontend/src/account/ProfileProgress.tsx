import type { CompanyGap } from '../auth/api'
import { completedFields, GAP_LABELS, isOperatingGap, PROFILE_FIELDS } from './profileGaps'

/** Barra de avance del perfil: decorativa, el texto que la acompaña dice lo mismo. */
export function ProfileMeter({ missing }: { missing: readonly CompanyGap[] }) {
  const done = completedFields(missing)
  return (
    <span className="profile-meter" aria-hidden="true">
      <span className="profile-meter-fill" style={{ width: `${Math.round((done / PROFILE_FIELDS) * 100)}%` }} />
    </span>
  )
}

/**
 * Avance del perfil en Mi cuenta (T-S14-01): el detalle que el inicio ya no muestra. Dice cuántos datos van, cuáles
 * faltan y cuáles son necesarios para publicar y solicitar (M1). Con el perfil completo, solo lo confirma.
 */
export function ProfileProgress({ missing }: { missing: readonly CompanyGap[] }) {
  if (missing.length === 0) {
    return <p className="profile-progress complete" role="status">Tu perfil está completo. Mantén tus datos al día: las instituciones los ven en cada solicitud.</p>
  }
  const blocking = missing.some(isOperatingGap)
  return (
    <div className="profile-progress" aria-labelledby="profile-progress-title">
      <div className="profile-progress-head">
        <p id="profile-progress-title"><strong>{completedFields(missing)} de {PROFILE_FIELDS}</strong> datos del perfil completos</p>
        <ProfileMeter missing={missing} />
      </div>
      <p className="profile-progress-hint">
        {blocking
          ? 'Completa los datos marcados para publicar oportunidades y enviar solicitudes. El resto puede esperar.'
          : 'Ya puedes publicar y solicitar. Completar el resto ayuda a las instituciones a conocer tu empresa.'}
      </p>
      <ul className="profile-gaps" aria-label="Datos pendientes">
        {missing.map((gap) => (
          <li key={gap} className={isOperatingGap(gap) ? 'operating' : undefined}>
            {GAP_LABELS[gap]}{isOperatingGap(gap) && <span className="visually-hidden"> (necesario para operar)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
