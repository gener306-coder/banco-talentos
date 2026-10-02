import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { accessErrorMessages, ApiError } from '../lib/http'

export interface InstitutionFailure {
  status: number
  message: string
  errors: Record<string, string[]>
}

function useInstitutionFailure() {
  const { expireSession } = useAuth()

  return useCallback((error: unknown): InstitutionFailure => {
    const status = error instanceof ApiError ? error.status : 500
    if (status === 401) expireSession(error instanceof ApiError ? error : undefined)

    const messages: Record<number, string> = {
      0: 'No pudimos conectar con el servidor. Inténtalo de nuevo.',
      401: 'Tu sesión terminó. Inicia sesión de nuevo.',
      403: 'No tienes permiso para gestionar instituciones.',
      404: 'La institución no existe.',
      419: 'No pudimos validar la solicitud. Tus datos se conservaron; inténtalo de nuevo.',
      422: 'Revisa los campos indicados.',
      429: 'Demasiadas solicitudes. Espera al menos un minuto antes de volver a intentarlo.',
    }

    return {
      status,
      message: error instanceof ApiError && error.code ? accessErrorMessages[error.code]
        : messages[status] ?? 'No pudimos completar la solicitud. Inténtalo de nuevo.',
      errors: error instanceof ApiError ? error.errors : {},
    }
  }, [expireSession])
}

export function useInstitutionRequest<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<InstitutionFailure | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const describeFailure = useInstitutionFailure()

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

export function useInstitutionMutation() {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<InstitutionFailure | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const describeFailure = useInstitutionFailure()

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
