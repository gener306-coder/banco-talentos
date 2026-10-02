import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { setInitialPassword } from '../auth/api'
import { accessErrorMessages, ApiError } from '../lib/http'
import type { ValidationErrors } from '../lib/http'

const invalidLinkMessage = 'El enlace de configuración no es válido, ha caducado o ya fue utilizado.'

export function SetInitialPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  // Capturar antes de reemplazar la URL; el estado sobrevive al doble efecto de StrictMode.
  const [credentials, setCredentials] = useState(() => ({
    email: searchParams.get('email') ?? '', token: searchParams.get('token') ?? '',
  }))
  const { email, token } = credentials
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const busy = useRef(false)
  const generation = useRef(0)

  // El router instala su suscripción en layout; limpiar después permite reemplazar
  // también la entrada inicial sin perder la navegación ni guardar el enlace.
  useEffect(() => {
    if (searchParams.size > 0) navigate('/set-initial-password', { replace: true })
  }, [navigate, searchParams])

  useEffect(() => () => { ++generation.current }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !email || !token) return
    const validation: ValidationErrors = {}
    if ([...password].length < 12) validation.password = ['La contraseña debe tener al menos 12 caracteres.']
    if (new TextEncoder().encode(password).length > 72) validation.password = ['La contraseña no debe superar 72 bytes.']
    if (password.includes('\0')) validation.password = ['La contraseña contiene un carácter no permitido.']
    if (password !== confirmation) validation.password_confirmation = ['La confirmación de la contraseña no coincide.']
    setErrors(validation)
    setMessage(null)
    if (Object.keys(validation).length) return

    busy.current = true
    const version = generation.current
    setPending(true)
    try {
      await setInitialPassword({ email, token, password, password_confirmation: confirmation })
      if (version !== generation.current) return
      setPassword('')
      setConfirmation('')
      setCredentials({ email: '', token: '' })
      setComplete(true)
    } catch (error) {
      if (version !== generation.current) return
      if (error instanceof ApiError && error.status === 422) {
        if (error.errors.token?.length || error.errors.email?.length) setMessage(invalidLinkMessage)
        else {
          setErrors(error.errors)
          setMessage('Revisa los campos indicados.')
        }
      } else if (error instanceof ApiError && error.code) {
        setMessage(accessErrorMessages[error.code])
      } else if (error instanceof ApiError && error.status === 419) {
        setMessage('No pudimos validar la solicitud. Inténtalo de nuevo.')
      } else if (error instanceof ApiError && error.status === 429) {
        setMessage('Demasiados intentos. Espera un momento antes de volver a intentarlo.')
      } else if (error instanceof ApiError && error.status === 0) {
        setMessage('No pudimos conectar con el servidor. Inténtalo de nuevo.')
      } else {
        setMessage('No pudimos establecer la contraseña. Inténtalo de nuevo.')
      }
    } finally {
      if (version === generation.current) {
        busy.current = false
        setPending(false)
      }
    }
  }

  return (
    <section className="card password-setup" aria-labelledby="password-setup-title">
      <h2 id="password-setup-title">Establecer contraseña</h2>
      {complete ? <>
        <p role="status">Contraseña establecida. Ya puedes iniciar sesión.</p>
        <Link to="/login">Iniciar sesión</Link>
      </> : !email || !token ? <>
        <p className="notice" role="alert">{invalidLinkMessage}</p>
        <p>Si aún no has establecido tu contraseña, solicita a administración un nuevo enlace.</p>
      </> : <>
        <p>Establece tu contraseña para acceder con tu cuenta institucional.</p>
        <p id="password-requirements">Usa al menos 12 caracteres y un máximo de 72 bytes. Las letras acentuadas y otros caracteres pueden ocupar más de un byte.</p>
        {message && <p className="notice" role="alert">{message}</p>}
        {message === invalidLinkMessage && <p>Si aún no has establecido tu contraseña, solicita a administración un nuevo enlace.</p>}
        <form onSubmit={(event) => { void submit(event) }} aria-busy={pending}>
          <label htmlFor="initial-password">Contraseña</label>
          <input id="initial-password" name="password" type="password" autoComplete="new-password" required
            disabled={pending} value={password} aria-invalid={Boolean(errors.password?.length)}
            aria-describedby={`password-requirements${errors.password?.length ? ' initial-password-error' : ''}`}
            onChange={(event) => setPassword(event.target.value)} />
          {errors.password?.length > 0 && <p className="field-error" id="initial-password-error">{errors.password.join(' ')}</p>}
          <label htmlFor="password-confirmation">Confirmar contraseña</label>
          <input id="password-confirmation" name="password_confirmation" type="password" autoComplete="new-password" required
            disabled={pending} value={confirmation} aria-invalid={Boolean(errors.password_confirmation?.length)}
            aria-describedby={errors.password_confirmation?.length ? 'password-confirmation-error' : undefined}
            onChange={(event) => setConfirmation(event.target.value)} />
          {errors.password_confirmation?.length > 0 && <p className="field-error" id="password-confirmation-error">{errors.password_confirmation.join(' ')}</p>}
          <button type="submit" disabled={pending}>{pending ? 'Estableciendo contraseña…' : 'Establecer contraseña'}</button>
        </form>
      </>}
    </section>
  )
}
