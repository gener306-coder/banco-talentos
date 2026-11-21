import { Link, useLocation } from 'react-router'
import { backState } from '../ui/backLink'
import { legalConfig, PENDING } from './legalConfig'
import './legal.css'

/**
 * Aviso de privacidad simplificado de los accesos (HU-S15-04): responsable, finalidad principal y dónde consultar el
 * aviso integral. Es informativo (docs/sprint-15.md, D3); los documentos regresan a esta misma pantalla.
 */
export function SimplifiedNotice({ backLabel }: { backLabel: string }) {
  const location = useLocation()
  const state = backState(backLabel, location)
  // Mientras el responsable no se define, la pantalla de acceso no muestra el marcador como si fuera un nombre.
  const controller = legalConfig.controller.name === PENDING ? 'El responsable de la plataforma' : legalConfig.controller.name
  return (
    <p className="legal-note">
      {controller} trata tus datos para administrar tu cuenta y la vinculación de educación dual. Consulta
      el <Link to="/legal/privacidad" state={state}>Aviso de Privacidad</Link> y
      los <Link to="/legal/terminos" state={state}>Términos y Condiciones</Link>.
    </p>
  )
}
