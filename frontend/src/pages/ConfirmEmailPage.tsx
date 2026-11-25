import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { confirmAccessEmail } from '../auth/api'
import type { EmailConfirmation } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/http'

type Outcome = { kind: 'checking' } | { kind: 'done'; confirmation: EmailConfirmation } | { kind: 'invalid' } | { kind: 'taken' } | { kind: 'error'; message: string }

/**
 * T-S19-03 y T-S19-04: confirmación pública del correo de acceso, con o sin sesión. El enlace se confirma al abrirlo, una
 * sola vez (también bajo el doble efecto de StrictMode), y el token sale de la URL de inmediato.
 */
export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, restore } = useAuth()
  const [token] = useState(() => searchParams.get('token') ?? '')
  const [outcome, setOutcome] = useState<Outcome>(() => token ? { kind: 'checking' } : { kind: 'invalid' })
  const started = useRef(false)
  const signedIn = user !== null
  const signedInRef = useRef(signedIn)
  useEffect(() => { signedInRef.current = signedIn }, [signedIn])

  useEffect(() => {
    if (searchParams.size > 0) navigate('/confirm-email', { replace: true })
  }, [navigate, searchParams])

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    confirmAccessEmail(token).then((confirmation) => {
      setOutcome({ kind: 'done', confirmation })
      // Con sesión en este navegador, la identidad de la barra y de Mi cuenta se actualiza.
      if (signedInRef.current) void restore()
    }, (error: unknown) => {
      if (error instanceof ApiError && error.status === 422) setOutcome({ kind: 'invalid' })
      else if (error instanceof ApiError && error.status === 409) setOutcome({ kind: 'taken' })
      else if (error instanceof ApiError && error.status === 429) setOutcome({ kind: 'error', message: 'Demasiados intentos. Espera un momento y vuelve a abrir el enlace.' })
      else setOutcome({ kind: 'error', message: 'No pudimos confirmar el correo. Vuelve a abrir el enlace en unos momentos.' })
    })
  }, [token, restore])

  const next = signedIn ? <Link to="/account">Ir a Mi cuenta</Link> : <Link to="/login">Iniciar sesión</Link>

  return (
    <section className="card password-setup" aria-labelledby="confirm-email-title">
      <h2 id="confirm-email-title">Confirmación de correo</h2>
      {outcome.kind === 'checking' && <p role="status">Confirmando tu correo…</p>}
      {outcome.kind === 'done' && <>
        <p role="status">{outcome.confirmation.result === 'changed'
          ? `Listo: tu correo de acceso ahora es ${outcome.confirmation.email}. Cerramos tus sesiones en otros dispositivos.`
          : `Listo: verificamos tu correo de acceso ${outcome.confirmation.email}.`}</p>
        {outcome.confirmation.result === 'changed' && !signedIn && <p>Inicia sesión con tu correo nuevo; tu contraseña no cambió.</p>}
        {next}
      </>}
      {outcome.kind === 'invalid' && <>
        <p className="notice" role="alert">El enlace no es válido: venció, ya se usó o el cambio se canceló.</p>
        <p>Entra a Mi cuenta para enviar un enlace nuevo. Tu correo de acceso no cambió.</p>
        {next}
      </>}
      {outcome.kind === 'taken' && <>
        <p className="notice" role="alert">Ese correo ya fue registrado en otra cuenta, así que no pudimos usarlo. Tu correo de acceso no cambió.</p>
        <p>Desde Mi cuenta puedes pedir el cambio a otra dirección.</p>
        {next}
      </>}
      {outcome.kind === 'error' && <p className="notice" role="alert">{outcome.message}</p>}
    </section>
  )
}
