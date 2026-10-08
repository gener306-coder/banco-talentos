import { setInitialPassword } from '../auth/api'
import { NewPasswordForm } from './NewPasswordForm'

export function SetInitialPasswordPage() {
  return (
    <NewPasswordForm
      path="/set-initial-password"
      title="Establecer contraseña"
      intro="Establece tu contraseña para acceder con tu cuenta institucional."
      submitLabel="Establecer contraseña"
      pendingLabel="Estableciendo contraseña…"
      successMessage="Contraseña establecida. Ya puedes iniciar sesión."
      invalidLinkMessage="El enlace de configuración no es válido, ha caducado o ya fue utilizado."
      invalidLinkHelp="Si aún no has establecido tu contraseña, solicita a administración un nuevo enlace."
      failureMessage="No pudimos establecer la contraseña. Inténtalo de nuevo."
      submit={setInitialPassword}
    />
  )
}
