import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, currentUser, login, logout } from './api'
import type { User } from './api'
import { AuthContext } from './auth-context'
import type { AuthState } from './auth-context'
import { accessErrorMessages } from '../lib/http'

type Session = Pick<AuthState, 'status' | 'user' | 'message'>

const expiredMessage = 'Tu sesión terminó. Inicia sesión de nuevo.'
const forbiddenMessage = 'No tienes permiso para realizar esta acción.'
const connectionMessage = 'No pudimos conectar con el servidor. Inténtalo de nuevo.'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) return connectionMessage
  return 'No pudimos completar la solicitud. Inténtalo de nuevo.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading', user: null, message: null })
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const restore = useCallback(async () => {
    if (busy.current) return
    const version = ++generation.current
    controller.current?.abort()
    controller.current = new AbortController()
    setSession({ status: 'loading', user: null, message: null })

    try {
      const user = await currentUser(controller.current.signal)
      if (version === generation.current) setSession({ status: 'ready', user, message: null })
    } catch (error) {
      if (version !== generation.current) return
      if (error instanceof ApiError && [401, 419].includes(error.status)) {
        setSession({ status: 'ready', user: null, message: error.code ? accessErrorMessages[error.code] : error.status === 419 ? expiredMessage : null })
      } else if (error instanceof ApiError && error.status === 403) {
        setSession({ status: 'forbidden', user: null, message: forbiddenMessage })
      } else {
        setSession({ status: 'error', user: null, message: errorMessage(error) })
      }
    }
  }, [])

  const cancelPending = useCallback(() => {
    ++generation.current
    controller.current?.abort()
  }, [])

  const expireSession = useCallback((error?: ApiError) => {
    cancelPending()
    busy.current = false
    setPending(false)
    setSession({ status: 'ready', user: null, message: error?.code ? accessErrorMessages[error.code] : expiredMessage })
  }, [cancelPending])

  useEffect(() => {
    void restore()
    return cancelPending
  }, [restore, cancelPending])

  async function mutate(action: () => Promise<User | void>, signingOut: boolean) {
    if (busy.current) return
    busy.current = true
    const version = ++generation.current
    controller.current?.abort()
    setPending(true)
    setSession((previous) => ({ ...previous, message: null }))

    try {
      const user = await action()
      if (version !== generation.current) return
      setSession({ status: 'ready', user: user ?? null, message: null })
    } catch (error) {
      if (version !== generation.current) return
      if (error instanceof ApiError && (error.status === 401 || (error.status === 419 && !signingOut) || (error.status === 403 && error.code))) {
        setSession({ status: 'ready', user: null, message: error.code ? accessErrorMessages[error.code] : expiredMessage })
      } else {
        const message = signingOut && error instanceof ApiError && error.status === 419
          ? 'No pudimos cerrar la sesión. Inténtalo de nuevo.'
          : error instanceof ApiError && error.status === 403
            ? forbiddenMessage
          : !signingOut && error instanceof ApiError && error.status === 422
            ? 'No fue posible iniciar sesión con esos datos.'
            : error instanceof ApiError && error.status === 429
              ? 'Demasiados intentos. Espera un momento antes de volver a intentarlo.'
              : errorMessage(error)
        setSession((previous) => ({ ...previous, message }))
      }
    } finally {
      if (version === generation.current) {
        busy.current = false
        setPending(false)
      }
    }
  }

  return (
    <AuthContext.Provider value={{
      ...session,
      pending,
      restore,
      expireSession,
      signIn: (email, password) => mutate(() => login(email, password), false),
      signOut: () => mutate(logout, true),
    }}>
      {children}
    </AuthContext.Provider>
  )
}
