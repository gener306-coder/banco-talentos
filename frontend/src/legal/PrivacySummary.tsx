import type { ReactNode } from 'react'
import { BriefcaseIcon, BuildingIcon, ChartIcon, IdCardIcon } from '../ui/icons'

/** Etiqueta de privacidad de un actor (HU-S15-01, CA-03): qué datos, para qué y quién los ve. */
interface PrivacyLabel { icon: ReactNode; actor: string; data: string; purpose: string; visibleTo: string }

const labels: readonly PrivacyLabel[] = [
  {
    icon: <BuildingIcon />, actor: 'Instituciones',
    data: 'Cuenta de acceso, nombre oficial, CCT y contacto del programa dual.',
    purpose: 'Administrar a sus alumnos y responder solicitudes de vinculación.',
    visibleTo: 'Empresas (nombre y contacto), Administración y Secretaría.',
  },
  {
    icon: <BriefcaseIcon />, actor: 'Empresas',
    data: 'Cuenta de acceso, razón social o nombre comercial, RFC, sector, estado y municipio, y contacto.',
    purpose: 'Publicar oportunidades duales y solicitar vinculaciones.',
    visibleTo: 'Secretaría de Economía y, en cada solicitud, la institución del alumno.',
  },
  {
    icon: <IdCardIcon />, actor: 'Alumnos (sin cuenta)',
    data: 'Expediente académico, CV y seguro social, capturados por su institución.',
    purpose: 'Postularlos a oportunidades duales y coordinar su vinculación.',
    visibleTo: 'Su institución. Las empresas solo ven un perfil sin identidad.',
  },
  {
    icon: <ChartIcon />, actor: 'Secretaría y Administración',
    data: 'Cuentas de su personal y bitácora de cambios, sin valores ni contraseñas.',
    purpose: 'Validar empresas, gestionar instituciones y cuentas, y elaborar estadísticas.',
    visibleTo: 'Solo el personal autorizado. Las estadísticas son agregadas.',
  },
]

export function PrivacySummary() {
  return (
    <section className="legal-summary" aria-labelledby="legal-summary-title">
      <h3 id="legal-summary-title">De un vistazo</h3>
      <ul className="legal-labels">
        {labels.map((label) => (
          <li key={label.actor} className="legal-label">
            <p className="legal-label-actor">{label.icon}{label.actor}</p>
            <dl>
              <dt>Datos</dt><dd>{label.data}</dd>
              <dt>Para qué</dt><dd>{label.purpose}</dd>
              <dt>Quién los ve</dt><dd>{label.visibleTo}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="legal-summary-note">
        Sin publicidad, sin venta de datos y sin rastreadores de terceros. La empresa nunca recibe de la plataforma la identidad del alumno.
      </p>
    </section>
  )
}
