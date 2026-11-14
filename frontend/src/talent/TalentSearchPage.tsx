import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { MAX_PERIOD, MEXICAN_STATES } from '../students/catalogs'
import { CV_LANGUAGES, displayName, LANGUAGE_LEVELS } from '../students/cvCatalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { SkillPicker } from '../students/SkillPicker'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { Sheet } from '../ui/Sheet'
import { useMediaQuery } from '../ui/useMediaQuery'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { emptyFilters, filtersFromParams, MAX_QUERY_LENGTH, MAX_SKILL_FILTERS, RADII_KM, searchParams, searchTalent, talentMessages, talentViewParams } from './api'
import type { TalentFilters } from './api'
import { TalentCardView } from './TalentCardView'
import '../institutions/institutions.css'
import './talent.css'

const periods = Array.from({ length: MAX_PERIOD }, (_, index) => index + 1)
// Mismo corte que la retícula de talent.css: por debajo, los filtros viven en una hoja (T-S12-03).
const NARROW_QUERY = '(max-width: 959px)'

/** Filtros aplicados que difieren del panel vacío; el nivel de idioma cuenta con su idioma. */
function activeFilters(filters: TalentFilters): number {
  return (Object.keys(emptyFilters) as (keyof TalentFilters)[]).filter((key) => key !== 'minLevel' &&
    (Array.isArray(filters[key]) ? (filters[key] as unknown[]).length > 0 : filters[key] !== emptyFilters[key])).length
}

/**
 * Buscador de talento anónimo (HU-S4-05): panel de filtros y tarjetas, sin mapa (CA-10). La búsqueda se lanza al
 * enviar el panel; los resultados son exploratorios y no ofrecen ninguna acción de contacto.
 */
export function TalentSearchPage() {
  // T-S12-07: los filtros aplicados y la página viven en la URL (mismo formato que la API). El regreso desde un perfil,
  // una recarga o el atajo del inicio (/talent?skills[]=…) reconstruyen la búsqueda; el panel edita un borrador local.
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const { filters: applied, page } = useMemo(() => filtersFromParams(new URLSearchParams(query)), [query])
  const location = useLocation()
  // Transición: el atajo anterior del inicio llevaba una habilidad en el estado de navegación; se pasa a la URL.
  const legacy: unknown = location.state
  const legacySkill = typeof legacy === 'object' && legacy !== null && 'skill' in legacy && typeof legacy.skill === 'string' ? displayName(legacy.skill).slice(0, 80) : ''
  useEffect(() => {
    if (legacySkill && !params.has('skills[]')) setParams(talentViewParams({ ...emptyFilters, skills: [legacySkill] }, 1), { replace: true })
  }, [legacySkill, params, setParams])
  const [draft, setDraft] = useState<TalentFilters>(applied)
  const [pickerKey, setPickerKey] = useState(0)
  const [originMode, setOriginMode] = useState<'company' | 'other'>(applied.originMunicipalityCode ? 'other' : 'company')
  const [originState, setOriginState] = useState(applied.originMunicipalityCode.slice(0, 2))
  const [originError, setOriginError] = useState<string | null>(null)
  // Si la URL cambia desde fuera del panel (el atajo anterior, Atrás del navegador), el borrador la sigue.
  const [syncedQuery, setSyncedQuery] = useState(query)
  if (syncedQuery !== query) {
    setSyncedQuery(query)
    setDraft(applied)
    setOriginMode(applied.originMunicipalityCode ? 'other' : 'company')
    setOriginState(applied.originMunicipalityCode.slice(0, 2))
  }
  const show = (filters: TalentFilters, nextPage: number) => setParams(talentViewParams(filters, nextPage), { replace: true })
  const setPage = (nextPage: number) => show(applied, nextPage)
  const load = useCallback((signal: AbortSignal) => searchTalent(applied, page, signal), [applied, page])
  const { data, loading, failure, refresh } = useApiRequest(load, talentMessages)
  const narrow = useMediaQuery(NARROW_QUERY)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const active = activeFilters(applied)

  function set<K extends keyof TalentFilters>(field: K, value: TalentFilters[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  // Filtros tal como se enviarían: un idioma sin nivel se busca desde A1 y el origen depende del modo elegido.
  const effective: TalentFilters = { ...draft, minLevel: draft.language ? draft.minLevel || '1' : '', originMunicipalityCode: originMode === 'other' ? draft.originMunicipalityCode : '' }
  // T-S11-01 CA-05: hay cambios en el panel que la lista de resultados todavía no refleja.
  const pending = searchParams(effective, 1).toString() !== searchParams(applied, 1).toString()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (originMode === 'other' && !draft.originMunicipalityCode) {
      setOriginError('Elige el municipio desde el que se mide la distancia.')
      return
    }
    setOriginError(null)
    show(effective, 1)
    setFiltersOpen(false)
  }

  function clear() {
    setDraft(emptyFilters)
    show(emptyFilters, 1)
    setOriginMode('company')
    setOriginState('')
    setOriginError(null)
    // El campo de habilidades guarda lo que se está escribiendo: se reinicia con el panel.
    setPickerKey((current) => current + 1)
  }

  // Un solo panel: en pantallas anchas es la columna izquierda; en estrechas, el contenido de la hoja.
  const filters = (
    <form className={narrow ? 'talent-filters in-sheet' : 'talent-filters'} role="search" aria-label="Filtros de búsqueda" onSubmit={submit} noValidate>
      <fieldset>
        <legend>Texto</legend>
        <label htmlFor="talent-q">Titular o carrera</label>
        <input id="talent-q" type="text" maxLength={MAX_QUERY_LENGTH} value={draft.q} aria-describedby="talent-q-hint"
          onChange={(event) => set('q', event.target.value)} />
        <p className="field-hint" id="talent-q-hint">Tolera acentos omitidos y errores de escritura.</p>
      </fieldset>

      <fieldset>
        <legend>Habilidades</legend>
        {/* HU-S11-01: solo habilidades del catálogo; el tipo no se muestra en un filtro. */}
        <SkillPicker key={pickerKey} idPrefix="talent" catalogOnly label="Agregar habilidad (todas requeridas)"
          skills={draft.skills.map((name) => ({ name, kind: 'technical' }))} max={MAX_SKILL_FILTERS} disabled={false} serverError={null}
          onChange={(skills) => set('skills', skills.map((skill) => skill.name))} />
      </fieldset>

      <fieldset>
        <legend>Idioma</legend>
        <label htmlFor="talent-language">Idioma</label>
        <select id="talent-language" value={draft.language} onChange={(event) => set('language', event.target.value)}>
          <option value="">Cualquiera</option>
          {CV_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>
        <label htmlFor="talent-level">Nivel mínimo</label>
        <select id="talent-level" value={draft.minLevel} disabled={!draft.language} onChange={(event) => set('minLevel', event.target.value)}>
          <option value="">Cualquiera</option>
          {LANGUAGE_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
        </select>
      </fieldset>

      <fieldset>
        <legend>Formación</legend>
        <label htmlFor="talent-period">Periodo mínimo</label>
        <select id="talent-period" value={draft.minPeriod} onChange={(event) => set('minPeriod', event.target.value)}>
          <option value="">Cualquiera</option>
          {periods.map((number) => <option key={number} value={number}>{number}.º o posterior</option>)}
        </select>
        <div className="check">
          <input id="talent-verified" type="checkbox" checked={draft.verifiedCertification} onChange={(event) => set('verifiedCertification', event.target.checked)} />
          <label htmlFor="talent-verified">Con al menos una certificación revisada</label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Disponibilidad</legend>
        <div className="check">
          <input id="talent-dual" type="checkbox" checked={draft.dualAvailable} onChange={(event) => set('dualAvailable', event.target.checked)} />
          <label htmlFor="talent-dual">Disponible para el programa dual</label>
        </div>
        <div className="check">
          <input id="talent-relocate" type="checkbox" checked={draft.canRelocate} onChange={(event) => set('canRelocate', event.target.checked)} />
          <label htmlFor="talent-relocate">Puede reubicarse</label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Ubicación</legend>
        <label htmlFor="talent-state">Estado del alumno</label>
        <select id="talent-state" value={draft.stateCode} onChange={(event) => set('stateCode', event.target.value)}>
          <option value="">Cualquiera</option>
          {MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
        </select>
        <label htmlFor="talent-radius">Distancia máxima</label>
        <select id="talent-radius" value={draft.radiusKm} onChange={(event) => set('radiusKm', event.target.value)}>
          <option value="">Sin límite</option>
          {RADII_KM.map((km) => <option key={km} value={km}>{km} km</option>)}
        </select>
        <fieldset className="choice-group">
          <legend>Medir la distancia desde</legend>
          <div>
            <input id="talent-origin-company" type="radio" name="talent-origin" checked={originMode === 'company'}
              onChange={() => { setOriginMode('company'); setOriginError(null) }} />
            <label htmlFor="talent-origin-company">El municipio de mi empresa</label>
          </div>
          <div>
            <input id="talent-origin-other" type="radio" name="talent-origin" checked={originMode === 'other'} onChange={() => setOriginMode('other')} />
            <label htmlFor="talent-origin-other">Otro municipio</label>
          </div>
        </fieldset>
        {originMode === 'other' && (
          <>
            <label htmlFor="talent-origin-state">Estado de origen</label>
            <select id="talent-origin-state" value={originState}
              onChange={(event) => { setOriginState(event.target.value); set('originMunicipalityCode', '') }}>
              <option value="">Selecciona…</option>
              {MEXICAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
            </select>
            <label htmlFor="talent-origin-municipality">Municipio de origen</label>
            <MunicipalityCombobox key={originState} id="talent-origin-municipality" state={originState} code={draft.originMunicipalityCode}
              initialName="" invalid={Boolean(originError)} describedBy={originError ? 'talent-origin-error' : undefined}
              onSelect={(municipality) => { set('originMunicipalityCode', municipality?.code ?? ''); setOriginError(null) }} />
            {originError && <p className="field-error" id="talent-origin-error">{originError}</p>}
          </>
        )}
      </fieldset>

      <div className="actions">
        <button type="submit" className={pending ? 'talent-pending' : undefined}><SearchIcon />{pending ? 'Aplicar filtros' : 'Buscar'}</button>
        <button type="button" className="secondary" onClick={clear}>Limpiar filtros</button>
      </div>
    </form>
  )

  return (
    <section className="card institutions" aria-labelledby="talent-title">
      <nav className="institution-navigation" aria-label="Navegación del buscador">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="talent-title">Buscar talento</h2>
      <p>Perfiles anónimos de alumnos activos. Las instituciones administran su información; aquí no se muestran datos personales.</p>
      <div className="talent-layout">
        {narrow ? (
          <div className="talent-filters-toggle">
            <button type="button" className={pending ? 'secondary talent-pending' : 'secondary'} aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
              <SearchIcon />{active ? `Filtros (${active})` : 'Filtros'}
            </button>
          </div>
        ) : filters}

        <div>
          {loading ? <LoadingState label="Buscando perfiles…" variant="table" />
            : failure ? <InstitutionRequestError failure={failure} retry={refresh} page />
            : data && (
              <section aria-labelledby="talent-results-title">
                <h3 id="talent-results-title" className="visually-hidden">Resultados</h3>
                <p className="talent-results-summary" role="status">
                  {data.total === 1 ? '1 perfil encontrado' : `${data.total} perfiles encontrados`}
                </p>
                {data.cards.length === 0
                  ? <StateMessage kind="empty" icon={<SearchIcon />} title="Ningún perfil coincide con los filtros."
                    description="Prueba con menos habilidades, un radio mayor o sin filtrar por estado." />
                  : (
                    <ul className="talent-cards">
                      {data.cards.map((card) => <li key={card.publicId}><TalentCardView card={card} /></li>)}
                    </ul>
                  )}
                {data.lastPage > 1 && (
                  <div className="pager">
                    <p>Página {data.page} de {data.lastPage}</p>
                    <div className="actions">
                      <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeftIcon />Anterior</button>
                      <button type="button" className="secondary" disabled={data.page >= data.lastPage} onClick={() => setPage(data.page + 1)}>Siguiente<ChevronRightIcon /></button>
                    </div>
                  </div>
                )}
              </section>
            )}
        </div>
      </div>
      {narrow && (
        <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} labelledBy="talent-filters-title">
          <h3 id="talent-filters-title">Filtros de búsqueda</h3>
          {filters}
        </Sheet>
      )}
    </section>
  )
}
