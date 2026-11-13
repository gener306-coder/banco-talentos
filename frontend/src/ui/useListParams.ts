import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** Valor de un filtro o de la página: vacío, nulo o la página 1 se quitan de la URL. */
type ParamValue = string | number | null | undefined

/**
 * Filtros, búsqueda y página de un listado sincronizados con la URL (T-S12-05). La vista se reconstruye solo desde la
 * URL, así que el regreso contextual (ui/backLink.ts) recupera exactamente la misma vista, con la recarga y los enlaces
 * compartidos incluidos. Cambiar un filtro vuelve a la página 1; los cambios reemplazan la entrada del historial para que
 * «Atrás» del navegador no recorra cada filtro.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams()
  const pageParam = Number(params.get('page'))
  const page = Number.isSafeInteger(pageParam) && pageParam > 1 ? pageParam : 1
  const get = useCallback((name: string) => params.get(name) ?? '', [params])

  const update = useCallback((changes: Record<string, ParamValue>) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (!('page' in changes)) next.delete('page')
      for (const [name, value] of Object.entries(changes)) {
        const text = value === null || value === undefined ? '' : String(value)
        if (text === '' || (name === 'page' && text === '1')) next.delete(name)
        else next.set(name, text)
      }
      return next
    }, { replace: true })
  }, [setParams])

  const setPage = useCallback((value: number) => update({ page: value }), [update])
  const clear = useCallback(() => setParams({}, { replace: true }), [setParams])

  return { get, page, setPage, update, clear }
}
