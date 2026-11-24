import { useState } from 'react'
import { EyeIcon, EyeOffIcon, LockIcon } from './icons'

export interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  disabled?: boolean
  name?: string
  placeholder?: string
  /** Ayuda propia del campo, mostrada bajo la etiqueta. */
  help?: string
  /** Identificadores de descripciones que ya existen fuera del campo (p. ej. los requisitos de la contraseña). */
  describedBy?: string
  /** Mensaje de error del campo; una lista se une en una sola línea. */
  error?: string | readonly string[]
}

/**
 * Campo de contraseña con mostrar u ocultar (T-S8-04; compartido desde T-S18-01). Lo usan el inicio de sesión, el cambio
 * de contraseña de Mi cuenta y las pantallas públicas de contraseña inicial y de restablecimiento.
 */
export function PasswordField({
  id, label, value, onChange, autoComplete, disabled = false, name, placeholder, help, describedBy, error,
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false)
  // Un campo que se vacía (p. ej. tras un intento de inicio de sesión) vuelve a ocultarse; mostrarlo vacío sí se respeta.
  const [previous, setPrevious] = useState(value)
  if (value !== previous) {
    setPrevious(value)
    if (value === '') setShown(false)
  }
  const message = Array.isArray(error) ? error.join(' ') : (error as string | undefined)
  const describers = [describedBy, help ? `${id}-help` : null, message ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      <div className="input-with-icon has-action">
        <LockIcon />
        <input id={id} name={name} type={shown ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder}
          required value={value} disabled={disabled} aria-invalid={Boolean(message)} aria-describedby={describers}
          onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="plain input-action" aria-label={`Mostrar ${label.toLowerCase()}`} aria-pressed={shown}
          aria-controls={id} disabled={disabled} onClick={() => setShown((current) => !current)}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {message && <p className="field-error" id={`${id}-error`}>{message}</p>}
    </>
  )
}
