import type { CompanyGap, InstitutionGap } from '../auth/api'
import { completedFields, GAP_LABELS, INSTITUTION_GAP_LABELS, INSTITUTION_PROFILE_FIELDS, isOperatingGap, PROFILE_FIELDS } from './profileGaps'

/** Lo que falta: de la empresa (7 datos, 3 para operar) o de la institución (4 datos, todos para operar, HU-S16-07). */
type Gaps = { kind?: 'company'; missing: readonly CompanyGap[] } | { kind: 'institution'; missing: readonly InstitutionGap[] }

const totalOf = (gaps: Gaps) => gaps.kind === 'institution' ? INSTITUTION_PROFILE_FIELDS : PROFILE_FIELDS

/**
 * Avance del perfil en la cabecera de su tarjeta (T-S14-04): la barra y «N de 7», o «Perfil completo» en verde.
 * Es la única cuenta visible; el detalle de abajo dice qué falta sin repetirla.
 */
export function ProfileScore(gaps: Gaps) {
  if (gaps.missing.length === 0) return <span className="profile-score complete">Perfil completo</span>
  return (
    <span className="profile-score">
      <ProfileMeter {...gaps} />
      <span>{completedFields(gaps.missing, totalOf(gaps))} de {totalOf(gaps)} datos</span>
    </span>
  )
}

/** Barra de avance del perfil: decorativa, el texto que la acompaña dice lo mismo. */
export function ProfileMeter(gaps: Gaps) {
  const total = totalOf(gaps)
  const done = completedFields(gaps.missing, total)
  return (
    <span className="profile-meter" aria-hidden="true">
      <span className="profile-meter-fill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
    </span>
  )
}

/**
 * Avance del perfil en Mi cuenta (T-S14-01): el detalle que el inicio ya no muestra. Dice cuántos datos van, cuáles
 * faltan y cuáles son necesarios para operar (M1; en la institución, todos, HU-S16-08). Con el perfil completo, solo lo
 * confirma.
 */
export function ProfileProgress({ compact = false, ...gaps }: Gaps & { compact?: boolean }) {
  const institution = gaps.kind === 'institution'
  if (gaps.missing.length === 0) {
    if (compact) return null
    return (
      <p className="profile-progress complete" role="status">
        {institution
          ? 'Tu perfil está completo. Mantén tus datos al día: las empresas los ven al vincularse con tus alumnos.'
          : 'Tu perfil está completo. Mantén tus datos al día: las instituciones los ven en cada solicitud.'}
      </p>
    )
  }
  const total = totalOf(gaps)
  const items = gaps.kind === 'institution'
    ? gaps.missing.map((gap) => ({ gap, label: INSTITUTION_GAP_LABELS[gap], operating: true }))
    : gaps.missing.map((gap) => ({ gap, label: GAP_LABELS[gap], operating: isOperatingGap(gap) }))
  const blocking = items.some((item) => item.operating)
  return (
    <div className={compact ? 'profile-progress compact' : 'profile-progress'}>
      {/* Con `compact`, la cuenta y la barra ya están en la cabecera de la tarjeta (ProfileScore). */}
      {!compact && (
        <div className="profile-progress-head">
          <p><strong>{completedFields(gaps.missing, total)} de {total}</strong> datos del perfil completos</p>
          <ProfileMeter {...gaps} />
        </div>
      )}
      <p className="profile-progress-hint">
        {institution
          ? 'Completa estos datos para que tus alumnos aparezcan en la búsqueda de talento, subir videos y aceptar solicitudes.'
          : blocking
            ? 'Completa los datos marcados para publicar oportunidades y enviar solicitudes. El resto puede esperar.'
            : 'Ya puedes publicar y solicitar. Completar el resto ayuda a las instituciones a conocer tu empresa.'}
      </p>
      <ul className="profile-gaps" aria-label="Datos pendientes">
        {items.map(({ gap, label, operating }) => (
          <li key={gap} className={operating ? 'operating' : undefined}>
            {label}{operating && <span className="visually-hidden"> (necesario para operar)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
