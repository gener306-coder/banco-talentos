import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { changePassword, roleLabels, updateAccount } from '../auth/api'
import type { Role, User } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { EyeIcon, EyeOffIcon, LockIcon, PencilIcon } from '../ui/icons'
import { NavBackLink } from '../ui/NavBackLink'
import { Sheet } from '../ui/Sheet'
import { useSnackbar } from '../ui/useSnackbar'
import { UserAvatar } from '../ui/UserAvatar'
import { OrganizationProfileSection } from './OrganizationProfileSection'
import './account.css'

const accountMessages: FailureMessages = {
  429: 'Hiciste demasiados intentos seguidos. Espera un minuto antes de volver a intentarlo.',
}

/** A quién pedir un cambio del correo de acceso, que no se edita desde la cuenta (Sprint 14, D5). */
const emailOwner: Record<Role, string> = {
  ADMIN: 'Para cambiarlo, contacta al equipo técnico del Banco de Talentos.',
  SECRETARY: 'Para cambiarlo, pídelo a quien administra las cuentas de la Secretaría de Economía.',
  INSTITUTION: 'Para cambiarlo, escribe a la Administración del Banco de Talentos.',
  COMPANY: 'Para cambiarlo, escribe a la Secretaría de Economía.',
}

function fieldErrors(errors: Record<string, string[]> | undefined, name: string): string | undefined {
  return errors?.[name]?.join(' ')
}

/** Subtítulo del perfil: el rol y, si la tiene, la organización de la cuenta. */
function roleLine(user: User): string {
  const organization = user.company?.name ?? user.institution?.name
  return organization ? `${roleLabels[user.role]} · ${organization}` : roleLabels[user.role]
}

/**
 * Tarjeta de identidad (T-S14-03): avatar, nombre, rol y correo. El nombre se edita en su sitio con el lápiz
 * (HU-S14-01 CA-02): Enter guarda, Escape cancela y el menú lo refleja al guardar, sin estado de carga.
 */
function IdentityCard({ user, notify }: { user: User; notify: (message: string) => void }) {
  const { updateUser } = useAuth()
  // M3: el nombre provisional de una invitada es su correo; se pide uno real en lugar de repetirlo.
  const provisional = user.name === user.email
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const pencil = useRef<HTMLButtonElement>(null)
  const mutation = useApiMutation(accountMessages)
  const error = fieldErrors(mutation.failure?.errors, 'name') ?? (mutation.failure && !mutation.failure.errors.name ? mutation.failure.message : undefined)
  const unchanged = name.trim() === user.name

  function start() {
    setName(provisional ? '' : user.name)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    // El foco vuelve al lápiz, que reaparece al salir de la edición.
    requestAnimationFrame(() => pencil.current?.focus())
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (unchanged) return cancel()
    void mutation.submit(() => updateAccount(name.trim()), (updated) => {
      updateUser(updated)
      notify('Nombre actualizado.')
      cancel()
    })
  }

  return (
    <section className="account-card account-identity" aria-label="Tu perfil">
      <UserAvatar name={user.name} size="lg" />
      <div className="account-identity-body">
        {editing ? (
          <form className="account-name-edit content-enter" onSubmit={submit} aria-busy={mutation.pending} noValidate>
            <label htmlFor="account-name" className="visually-hidden">Tu nombre</label>
            {/* El campo recibe el foco al entrar a la edición, que solo ocurre por acción de la persona. */}
            <input id="account-name" name="name" type="text" autoComplete="name" required maxLength={120} value={name} autoFocus
              placeholder="Tu nombre" disabled={mutation.pending} aria-invalid={Boolean(error)} aria-describedby={error ? 'account-name-error' : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }} />
            <div className="account-name-actions">
              <button type="submit" disabled={mutation.pending || name.trim() === ''}>
                <PendingLabel pending={mutation.pending} label="Guardar" pendingLabel="Guardando…" />
              </button>
              <button type="button" className="secondary" disabled={mutation.pending} onClick={cancel}>Cancelar</button>
            </div>
            {error && <p className="field-error" id="account-name-error">{error}</p>}
          </form>
        ) : (
          <div className="account-name-row content-enter">
            <h2 className={provisional ? 'account-name-title is-empty' : 'account-name-title'}>{provisional ? 'Agrega tu nombre' : user.name}</h2>
            <button ref={pencil} type="button" className="icon-button account-edit" aria-label="Editar nombre" title="Editar nombre" onClick={start}>
              <PencilIcon />
            </button>
          </div>
        )}
        <p className="account-role">{roleLine(user)}</p>
        <p className="account-email">{user.email}</p>
      </div>
    </section>
  )
}

/** Campo de contraseña con mostrar u ocultar (el mismo de T-S8-04). */
function PasswordField({ id, label, value, onChange, autoComplete, error, disabled, help }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; error?: string; disabled: boolean; help?: string
}) {
  const [shown, setShown] = useState(false)
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      <div className="input-with-icon has-action">
        <LockIcon />
        <input id={id} type={shown ? 'text' : 'password'} autoComplete={autoComplete} required value={value} disabled={disabled}
          aria-invalid={Boolean(error)} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="plain input-action" aria-label={`Mostrar ${label.toLowerCase()}`} aria-pressed={shown}
          aria-controls={id} disabled={disabled} onClick={() => setShown((value) => !value)}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </>
  )
}

/** Cambio de contraseña (HU-S14-01 CA-03, CA-07): en una hoja, con la contraseña actual. */
function PasswordSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const titleId = useId()
  const [values, setValues] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [localError, setLocalError] = useState<string | null>(null)
  const mutation = useApiMutation(accountMessages)
  const errors = mutation.failure?.errors
  const general = mutation.failure && Object.keys(mutation.failure.errors).length === 0 ? mutation.failure.message : null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (values.password !== values.password_confirmation) {
      setLocalError('Las contraseñas no coinciden.')
      return
    }
    setLocalError(null)
    void mutation.submit(() => changePassword(values), () => {
      setValues({ current_password: '', password: '', password_confirmation: '' })
      onChanged()
    })
  }

  const set = (name: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [name]: value }))
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h3 id={titleId}>Cambiar contraseña</h3>
      <p>Al guardarla, se cerrarán tus sesiones abiertas en otros dispositivos y te avisaremos por correo.</p>
      {general && <p className="notice" role="alert">{general}</p>}
      <form className="account-password-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
        <PasswordField id="account-current-password" label="Contraseña actual" value={values.current_password} onChange={set('current_password')}
          autoComplete="current-password" error={fieldErrors(errors, 'current_password')} disabled={mutation.pending} />
        <PasswordField id="account-new-password" label="Contraseña nueva" value={values.password} onChange={set('password')}
          autoComplete="new-password" error={fieldErrors(errors, 'password')} disabled={mutation.pending} help="Al menos 12 caracteres." />
        <PasswordField id="account-confirm-password" label="Confirma la contraseña nueva" value={values.password_confirmation}
          onChange={set('password_confirmation')} autoComplete="new-password"
          error={localError ?? fieldErrors(errors, 'password_confirmation')} disabled={mutation.pending} />
        <button type="submit" disabled={mutation.pending || !values.current_password || !values.password || !values.password_confirmation}>
          <PendingLabel pending={mutation.pending} label="Guardar contraseña" pendingLabel="Guardando contraseña…" />
        </button>
      </form>
    </Sheet>
  )
}

/**
 * Acceso y seguridad (T-S14-03), al estilo de Ajustes: filas con divisores finos. El correo de acceso es de solo lectura
 * (D5) y la contraseña se cambia en la hoja de HU-S14-01.
 */
function SecurityCard({ user, notify }: { user: User; notify: (message: string) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  return (
    <section className="account-card" aria-labelledby="account-security-title">
      <div className="account-card-head"><h3 id="account-security-title">Acceso y seguridad</h3></div>
      <div className="account-rows">
        <div className="account-row">
          <div className="account-row-main">
            <p className="account-row-label">Correo de acceso</p>
            <p className="account-row-value">{user.email}</p>
            <p className="account-row-note">{emailOwner[user.role]}</p>
          </div>
        </div>
        <div className="account-row">
          <div className="account-row-main">
            <p className="account-row-label">Contraseña</p>
            <p className="account-row-value account-dots"><span aria-hidden="true">••••••••••••</span><span className="visually-hidden">Oculta</span></p>
            <p className="account-row-note">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
          </div>
          <button type="button" className="secondary account-row-action" onClick={() => setSheetOpen(true)}>Cambiar contraseña</button>
        </div>
      </div>
      <PasswordSheet open={sheetOpen} onClose={() => setSheetOpen(false)}
        onChanged={() => { setSheetOpen(false); notify('Contraseña actualizada. Cerramos tus sesiones en otros dispositivos.') }} />
    </section>
  )
}

/**
 * Mi cuenta (HU-S14-01, rediseño T-S14-03): perfil de lectura primero y edición bajo demanda. La tarjeta de identidad,
 * acceso y seguridad y, para empresas e instituciones, el perfil de la organización.
 */
export function AccountPage() {
  const { user } = useAuth()
  // T-S14-04: las confirmaciones se anuncian en un aviso breve, no como texto suelto dentro de las tarjetas.
  const [snackbar, notify] = useSnackbar()
  if (!user) return null

  return (
    <section className="card institutions account-page" aria-label="Mi cuenta">
      {snackbar}
      <nav className="institution-navigation" aria-label="Navegación de la cuenta">
        <NavBackLink />
      </nav>
      <div className="content-enter account-stack">
        <IdentityCard user={user} notify={notify} />
        <SecurityCard user={user} notify={notify} />
        {/* HU-S14-02: el perfil de la organización, solo para empresas e instituciones. */}
        {(user.role === 'COMPANY' || user.role === 'INSTITUTION') && <OrganizationProfileSection notify={notify} />}
      </div>
    </section>
  )
}
