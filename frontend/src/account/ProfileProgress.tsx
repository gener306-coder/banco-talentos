import type { CompanyGap } from '../auth/api'
import { completedFields, GAP_LABELS, isOperatingGap, PROFILE_FIELDS } from './profileGaps'

/**
 * Avance del perfil en la cabecera de su tarjeta (T-S14-04): la barra y «N de 7», o «Perfil completo» en verde.
 * Es la única cuenta visible; el detalle de abajo dice qué falta sin repetirla.
 */
export function ProfileScore({ missing }: { missing: readonly CompanyGap[] }) {
  if (missing.length === 0) return <span className="profile-score complete">Perfil completo</span>
  return (
    <span className="profile-score">
      <ProfileMeter missing={missing} />
      <span>{completedFields(missing)} de {PROFILE_FIELDS} datos</span>
    </span>
  )
}

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
export function ProfileProgress({ missing, compact = false }: { missing: readonly CompanyGap[]; compact?: boolean }) {
  if (missing.length === 0) {
    return compact ? null : <p className="profile-progress complete" role="status">Tu perfil está completo. Mantén tus datos al día: las instituciones los ven en cada solicitud.</p>
  }
  const blocking = missing.some(isOperatingGap)
  return (
    <div className={compact ? 'profile-progress compact' : 'profile-progress'}>
      {/* Con `compact`, la cuenta y la barra ya están en la cabecera de la tarjeta (ProfileScore). */}
      {!compact && (
        <div className="profile-progress-head">
          <p><strong>{completedFields(missing)} de {PROFILE_FIELDS}</strong> datos del perfil completos</p>
          <ProfileMeter missing={missing} />
        </div>
      )}
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
