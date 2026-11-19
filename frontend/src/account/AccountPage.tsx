import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { changePassword, roleLabels, updateAccount } from '../auth/api'
import type { Role, User } from '../auth/api'
import { useAuth } from '../auth/useAuth'
import { useApiMutation } from '../lib/useApiRequest'
import type { FailureMessages } from '../lib/useApiRequest'
import { PendingLabel } from '../ui/forms'
import { EyeIcon, EyeOffIcon, LockIcon } from '../ui/icons'
import { NavBackLink } from '../ui/NavBackLink'
import { Sheet } from '../ui/Sheet'
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

/** Nombre de la cuenta (HU-S14-01 CA-02): se edita en su sitio y el menú lo refleja al guardar. */
function NameForm({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const [name, setName] = useState(user.name)
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useApiMutation(accountMessages)
  const error = fieldErrors(mutation.failure?.errors, 'name') ?? (mutation.failure && !mutation.failure.errors.name ? mutation.failure.message : undefined)
  const unchanged = name.trim() === user.name

  function submit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    void mutation.submit(() => updateAccount(name.trim()), (updated) => {
      updateUser(updated)
      setName(updated.name)
      setNotice('Nombre actualizado correctamente.')
    })
  }

  return (
    <form className="account-name-form" onSubmit={submit} aria-busy={mutation.pending} noValidate>
      <label htmlFor="account-name">Nombre</label>
      <div className="account-inline">
        <input id="account-name" name="name" type="text" autoComplete="name" required maxLength={120} value={name}
          disabled={mutation.pending} aria-invalid={Boolean(error)} aria-describedby={error ? 'account-name-error' : undefined}
          onChange={(event) => { setName(event.target.value); setNotice(null) }} />
        <button type="submit" disabled={mutation.pending || unchanged || name.trim() === ''}>
          <PendingLabel pending={mutation.pending} label="Guardar" pendingLabel="Guardando…" />
        </button>
      </div>
      {error && <p className="field-error" id="account-name-error">{error}</p>}
      {notice && <p className="institution-success" role="status">{notice}</p>}
    </form>
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
 * Mi cuenta (HU-S14-01): la persona de la sesión corrige su nombre y cambia su contraseña. El correo de acceso, el rol y
 * la organización se muestran como contexto, sin editarse aquí.
 */
export function AccountPage() {
  const { user } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  if (!user) return null
  const organization = user.company?.name ?? user.institution?.name

  return (
    <section className="card institutions account-page" aria-labelledby="account-title">
      <nav className="institution-navigation" aria-label="Navegación de la cuenta">
        <NavBackLink />
      </nav>
      <h2 id="account-title">Mi cuenta</h2>
      <div className="content-enter">
        <section className="student-section" aria-labelledby="account-data-title">
          <h3 id="account-data-title">Tus datos</h3>
          <NameForm user={user} />
          <dl className="student-identity">
            <dt>Correo de acceso</dt>
            <dd>{user.email}<span className="account-hint">{emailOwner[user.role]}</span></dd>
            <dt>Rol</dt><dd>{roleLabels[user.role]}</dd>
            {organization && <><dt>Organización</dt><dd>{organization}</dd></>}
          </dl>
        </section>
        {/* HU-S14-02: el perfil de la organización, solo para empresas e instituciones. */}
        {(user.role === 'COMPANY' || user.role === 'INSTITUTION') && <OrganizationProfileSection />}
        <section className="student-section" aria-labelledby="account-security-title">
          <h3 id="account-security-title">Seguridad</h3>
          <p>Cambia tu contraseña cuando lo necesites. Te pediremos la actual para confirmar que eres tú.</p>
          {passwordNotice && <p className="institution-success" role="status">{passwordNotice}</p>}
          <button type="button" className="secondary" onClick={() => { setPasswordNotice(null); setSheetOpen(true) }}>
            <LockIcon />Cambiar contraseña
          </button>
        </section>
      </div>
      <PasswordSheet open={sheetOpen} onClose={() => setSheetOpen(false)}
        onChanged={() => { setSheetOpen(false); setPasswordNotice('Contraseña actualizada correctamente. Cerramos tus sesiones en otros dispositivos.') }} />
    </section>
  )
}
