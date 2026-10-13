import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { accessErrorMessages, ApiError } from './http'

export interface ApiFailure {
  status: number
  message: string
  errors: Record<string, string[]>
}

/** Mensajes por código HTTP propios de cada módulo (por ejemplo, qué significa un 404). Debe ser una constante del módulo. */
export type FailureMessages = Partial<Record<number, string>>

const baseMessages: Record<number, string> = {
  0: 'No pudimos conectar con el servidor. Inténtalo de nuevo.',
  401: 'Tu sesión terminó. Inicia sesión de nuevo.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'El recurso solicitado no existe.',
  419: 'No pudimos validar la solicitud. Tus datos se conservaron; inténtalo de nuevo.',
  422: 'Revisa los campos indicados.',
  429: 'Demasiadas solicitudes. Espera al menos un minuto antes de volver a intentarlo.',
}

// Valor por defecto estable: un objeto nuevo en cada render relanzaría la carga en bucle.
const NO_OVERRIDES: FailureMessages = {}

function useFailure(overrides: FailureMessages) {
  const { expireSession } = useAuth()

  return useCallback((error: unknown): ApiFailure => {
    const status = error instanceof ApiError ? error.status : 500
    if (status === 401) expireSession(error instanceof ApiError ? error : undefined)

    const messages = { ...baseMessages, ...overrides }

    return {
      status,
      message: error instanceof ApiError && error.code ? accessErrorMessages[error.code]
        : messages[status] ?? 'No pudimos completar la solicitud. Inténtalo de nuevo.',
      errors: error instanceof ApiError ? error.errors : {},
    }
  }, [expireSession, overrides])
}

export function useApiRequest<T>(load: (signal: AbortSignal) => Promise<T>, messages: FailureMessages = NO_OVERRIDES) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const describeFailure = useFailure(messages)

  const refresh = useCallback(async () => {
    setLoading(true)
    setFailure(null)
    setRequestVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false

    async function fetchCurrent() {
      try {
        const result = await load(controller.signal)
        if (!disposed) setData(result)
      } catch (error) {
        if (!disposed) setFailure(describeFailure(error))
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void fetchCurrent()
    return () => {
      disposed = true
      controller.abort()
    }
  }, [load, describeFailure, requestVersion])

  return { data, loading, failure, refresh, setData }
}

export function useApiMutation(messages: FailureMessages = NO_OVERRIDES) {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const describeFailure = useFailure(messages)

  useEffect(() => () => { ++generation.current }, [])

  async function submit<T>(action: () => Promise<T>, onSuccess: (value: T) => void) {
    if (busy.current) return
    busy.current = true
    const version = generation.current
    setPending(true)
    setFailure(null)

    try {
      const result = await action()
      if (version === generation.current) onSuccess(result)
    } catch (error) {
      if (version === generation.current) setFailure(describeFailure(error))
    } finally {
      if (version === generation.current) {
        busy.current = false
        setPending(false)
      }
    }
  }

  return { pending, failure, submit }
}
