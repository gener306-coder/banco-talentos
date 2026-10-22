import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { catalogSlug } from './cvCatalogs'
import { listMunicipalities } from './municipalities'
import type { Municipality } from './municipalities'

/** Opciones visibles a la vez: hay estados con más de 500 municipios (Oaxaca, 570). */
const MAX_OPTIONS = 50

type Load = { state: string; status: 'ready'; municipalities: Municipality[] } | { state: string; status: 'error' }

interface Props {
  id: string
  /** Clave INEGI del estado elegido, o '' si aún no hay estado. */
  state: string
  /** Clave del municipio elegido, o '' si no hay ninguno. */
  code: string
  /** Nombre del municipio guardado, para mostrarlo sin esperar al catálogo. */
  initialName: string
  invalid: boolean
  describedBy?: string
  disabled?: boolean
  onSelect: (municipality: Municipality | null) => void
}

/**
 * Selector de municipio del catálogo INEGI con filtro por texto (HU-S4-04 CA-08). Depende del estado: sin estado
 * está deshabilitado y el formulario lo vuelve a montar al cambiar de estado, con lo que se limpia la elección.
 * El filtro ignora acentos y mayúsculas («coyoacan» encuentra «Coyoacán»).
 */
export function MunicipalityCombobox({ id, state, code, initialName, invalid, describedBy, disabled = false, onSelect }: Props) {
  const [load, setLoad] = useState<Load | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState(initialName)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()

  useEffect(() => {
    if (!state) return
    const controller = new AbortController()
    listMunicipalities(state, controller.signal)
      .then((municipalities) => setLoad({ state, status: 'ready', municipalities }))
      .catch(() => { if (!controller.signal.aborted) setLoad({ state, status: 'error' }) })
    return () => controller.abort()
  }, [state, attempt])

  const current = load?.state === state ? load : null
  const municipalities = current?.status === 'ready' ? current.municipalities : []
  const selected = municipalities.find((municipality) => municipality.code === code)
  const term = catalogSlug(query)
  // Con un municipio elegido se muestra la lista completa para poder cambiarlo; al escribir, se filtra.
  const matches = !term || (selected && query === selected.name)
    ? municipalities
    : municipalities
      .filter((municipality) => catalogSlug(municipality.name).includes(term))
      .sort((a, b) => Number(!catalogSlug(b.name).startsWith(term)) - Number(!catalogSlug(a.name).startsWith(term)))
  const options = matches.slice(0, MAX_OPTIONS)
  const expanded = open && options.length > 0
  const loading = Boolean(state) && current === null
  const hintId = `${id}-hint`

  function choose(municipality: Municipality) {
    setQuery(municipality.name)
    setOpen(false)
    setActive(-1)
    onSelect(municipality)
  }

  function type(value: string) {
    setQuery(value)
    setOpen(true)
    setActive(0)
    // Escribir invalida la elección anterior: solo cuenta un municipio elegido de la lista.
    onSelect(null)
  }

  function blur() {
    setOpen(false)
    // Un nombre escrito completo, sin elegirlo de la lista, se acepta si coincide con un solo municipio.
    if (!code && term) {
      const exact = municipalities.filter((municipality) => catalogSlug(municipality.name) === term)
      if (exact.length === 1) choose(exact[0])
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!options.length) return
      setOpen(true)
      setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Enter') {
      // Enter elige el municipio resaltado; no envía el formulario.
      if (expanded && active >= 0) {
        event.preventDefault()
        choose(options[active])
      }
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const hint = !state ? 'Elige primero el estado.'
    : loading ? 'Cargando municipios…'
    : current?.status === 'error' ? null
    : matches.length > MAX_OPTIONS ? `${matches.length} municipios. Escribe para acotar la lista.`
    : term && !matches.length && !selected ? 'Ningún municipio coincide con la búsqueda.'
    : null

  return (
    <>
      <div className="combobox">
        <input id={id} name="municipality" type="text" autoComplete="off" role="combobox"
          disabled={disabled || !state || loading || current?.status === 'error'}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={invalid} aria-describedby={[hint || current?.status === 'error' ? hintId : null, describedBy].filter(Boolean).join(' ') || undefined}
          value={query} placeholder={state ? 'Escribe para buscar' : undefined}
          onChange={(event) => type(event.target.value)} onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)} onBlur={blur} />
        <ul id={listId} role="listbox" aria-label="Municipios" className="combobox-list" hidden={!expanded}>
          {options.map((municipality, index) => (
            <li key={municipality.code} id={`${listId}-${index}`} role="option"
              aria-selected={municipality.code === code} className={index === active ? 'active' : undefined}
              // mousedown evita que el blur del campo cierre la lista antes del clic.
              onMouseDown={(event) => { event.preventDefault(); choose(municipality) }}>
              {municipality.name}
            </li>
          ))}
        </ul>
      </div>
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {current?.status === 'error' && (
        <p className="field-error" id={hintId} role="alert">
          No se pudieron cargar los municipios.{' '}
          <button type="button" className="plain" onClick={() => { setLoad(null); setAttempt((value) => value + 1) }}>Reintentar</button>
        </p>
      )}
    </>
  )
}
