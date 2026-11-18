import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { FiltersIcon, SearchIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { useMediaQuery } from '../ui/useMediaQuery'
import { LINKAGE_STATUSES } from './api'
import { activeFilterCount, INBOX_INTERACTIONS, INBOX_SORTS } from './inboxFilters'
import type { InboxFilters } from './inboxFilters'

type Changes = Partial<Record<keyof InboxFilters, string>>

/** Campo de búsqueda con borrador propio; se monta de nuevo (key) cuando la búsqueda de la URL cambia desde fuera. */
function SearchField({ id, label, placeholder, value, compact, busy, clear, onSearch }: {
  id: string; label: string; placeholder: string; value: string; compact: boolean; busy: boolean; clear?: ReactNode; onSearch: (q: string) => void
}) {
  const [draft, setDraft] = useState(value)
  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch(draft.trim())
  }
  return (
    <form className="table-search linkage-inbox-search" role="search" aria-label="Buscar solicitudes" onSubmit={submit}>
      <div className="table-search-field">
        {/* T-S13-13: «Limpiar filtros» vive en la línea de la etiqueta: aparecer o desaparecer no mueve la barra. */}
        <div className="linkage-inbox-label-row"><label htmlFor={id}>{label}</label>{clear}</div>
        <input id={id} type="search" maxLength={100} value={draft} placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value)
            // Vaciar el campo (o su × nativa) quita la búsqueda sin tener que enviar el campo vacío.
            if (event.target.value === '' && value !== '') onSearch('')
          }} />
      </div>
      {/* En el celular el botón es solo el ícono, en la misma fila que el campo; su nombre sigue siendo «Buscar». */}
      <button type="submit" className="secondary linkage-inbox-search-button" title="Buscar">
        {/* T-S13-13: mientras llega el resultado, el ícono cede su lugar a un spinner del mismo tamaño. */}
        {busy ? <span className="spinner" aria-hidden="true" /> : <SearchIcon />}{compact ? <span className="visually-hidden">Buscar</span> : 'Buscar'}
      </button>
    </form>
  )
}

/**
 * Barra de la bandeja (T-S13-09): búsqueda, Estado, Interacción y Ordenar por, sincronizados con la URL por quien la
 * usa. En pantallas anchas todo va en una fila; a 600 px o menos el buscador queda visible y los demás controles pasan
 * a una hoja con «Filtros (n)», para no empujar la tabla hacia abajo.
 */
export function LinkageInboxFilters({ idPrefix, searchLabel, placeholder, filters, busy = false, onChange, onClear, actions }: {
  idPrefix: string
  searchLabel: string
  placeholder: string
  filters: InboxFilters
  /** La tabla se está actualizando con los filtros nuevos (T-S13-13). */
  busy?: boolean
  onChange: (changes: Changes) => void
  onClear: () => void
  /** Acciones del listado a la derecha, por ejemplo «Descargar CSV». */
  actions?: ReactNode
}) {
  const narrow = useMediaQuery('(max-width: 600px)')
  const [open, setOpen] = useState(false)
  const count = activeFilterCount(filters)
  const anyActive = count > 0 || filters.q !== ''
  const clear = anyActive && <button type="button" className="plain linkage-inbox-clear" onClick={onClear}>Limpiar filtros</button>

  const selects = (
    <>
      <div className="table-search-filter">
        <label htmlFor={`${idPrefix}-status`}>Estado</label>
        <select id={`${idPrefix}-status`} value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
          <option value="">Todos los estados</option>
          {LINKAGE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="table-search-filter">
        <label htmlFor={`${idPrefix}-interaction`}>Interacción</label>
        <select id={`${idPrefix}-interaction`} value={filters.interaction}
          onChange={(event) => onChange({ interaction: event.target.value === 'all' ? '' : event.target.value })}>
          {INBOX_INTERACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="table-search-filter">
        <label htmlFor={`${idPrefix}-sort`}>Ordenar por</label>
        <select id={`${idPrefix}-sort`} value={filters.sort}
          onChange={(event) => onChange({ sort: event.target.value === 'activity' ? '' : event.target.value })}>
          {INBOX_SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
    </>
  )

  const search = <SearchField key={filters.q} id={`${idPrefix}-search`} label={searchLabel} placeholder={placeholder} value={filters.q}
    compact={narrow} busy={busy} clear={narrow ? undefined : clear || undefined} onSearch={(q) => onChange({ q })} />

  if (narrow) {
    const titleId = `${idPrefix}-filters-title`
    return (
      <div className="linkage-inbox-bar compact">
        {search}
        <div className="linkage-inbox-row">
          <button type="button" className="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <FiltersIcon />Filtros{count > 0 && <> <span key={count} className="linkage-inbox-count">({count})</span></>}
          </button>
          {clear}
          {actions && <div className="linkage-inbox-actions">{actions}</div>}
        </div>
        <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
          <h3 id={titleId} className="linkage-inbox-sheet-title">Filtros</h3>
          <div className="linkage-inbox-sheet">{selects}</div>
          <div className="linkage-inbox-sheet-actions">
            <button type="button" onClick={() => setOpen(false)}>{busy && <span className="spinner" aria-hidden="true" />}Ver resultados</button>
            {count > 0 && <button type="button" className="plain" onClick={() => onChange({ status: '', interaction: '', sort: '' })}>Limpiar filtros</button>}
          </div>
        </Sheet>
      </div>
    )
  }

  return (
    <div className="linkage-inbox-bar">
      {search}
      <div className="table-search linkage-inbox-selects" role="group" aria-label="Filtros de la bandeja">{selects}</div>
      {actions && <div className="linkage-inbox-actions">{actions}</div>}
    </div>
  )
}
