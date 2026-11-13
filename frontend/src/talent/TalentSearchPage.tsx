import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { MAX_PERIOD, MEXICAN_STATES } from '../students/catalogs'
import { CV_LANGUAGES, displayName, LANGUAGE_LEVELS } from '../students/cvCatalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { SkillPicker } from '../students/SkillPicker'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { emptyFilters, MAX_QUERY_LENGTH, MAX_SKILL_FILTERS, RADII_KM, searchTalent, talentMessages } from './api'
import type { TalentFilters } from './api'
import { TalentCardView } from './TalentCardView'
import '../institutions/institutions.css'
import './talent.css'

const periods = Array.from({ length: MAX_PERIOD }, (_, index) => index + 1)

/**
 * Buscador de talento anónimo (HU-S4-05): panel de filtros y tarjetas, sin mapa (CA-10). La búsqueda se lanza al
 * enviar el panel; los resultados son exploratorios y no ofrecen ninguna acción de contacto.
 */
export function TalentSearchPage() {
  // Atajo del inicio de la empresa: la habilidad llega ya como filtro aplicado.
  const location = useLocation()
  const [initial] = useState<TalentFilters>(() => {
    const state: unknown = location.state
    const skill = typeof state === 'object' && state !== null && 'skill' in state && typeof state.skill === 'string' ? displayName(state.skill).slice(0, 80) : ''
    return skill ? { ...emptyFilters, skills: [skill] } : emptyFilters
  })
  const [draft, setDraft] = useState<TalentFilters>(initial)
  const [applied, setApplied] = useState<TalentFilters>(initial)
  const [page, setPage] = useState(1)
  const [pickerKey, setPickerKey] = useState(0)
  const [originMode, setOriginMode] = useState<'company' | 'other'>('company')
  const [originState, setOriginState] = useState('')
  const [originError, setOriginError] = useState<string | null>(null)
  const load = useCallback((signal: AbortSignal) => searchTalent(applied, page, signal), [applied, page])
  const { data, loading, failure, refresh } = useApiRequest(load, talentMessages)

  function set<K extends keyof TalentFilters>(field: K, value: TalentFilters[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (originMode === 'other' && !draft.originMunicipalityCode) {
      setOriginError('Elige el municipio desde el que se mide la distancia.')
      return
    }
    setOriginError(null)
    // Un idioma sin nivel se busca desde A1.
    setApplied({ ...draft, minLevel: draft.language ? draft.minLevel || '1' : '', originMunicipalityCode: originMode === 'other' ? draft.originMunicipalityCode : '' })
    setPage(1)
  }

  function clear() {
    setDraft(emptyFilters)
    setApplied(emptyFilters)
    setOriginMode('company')
    setOriginState('')
    setOriginError(null)
    // El campo de habilidades guarda lo que se está escribiendo: se reinicia con el panel.
    setPickerKey((current) => current + 1)
    setPage(1)
  }

  return (
    <section className="card institutions" aria-labelledby="talent-title">
      <nav className="institution-navigation" aria-label="Navegación del buscador">
        <Link className="plain" to="/" aria-label="Volver al inicio"><ChevronLeftIcon />Inicio</Link>
      </nav>
      <h2 id="talent-title">Buscar talento</h2>
      <p>Perfiles anónimos de alumnos activos. Las instituciones administran su información; aquí no se muestran datos personales.</p>
      <div className="talent-layout">
        <form className="talent-filters" role="search" aria-label="Filtros de búsqueda" onSubmit={submit} noValidate>
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
            <button type="submit"><SearchIcon />Buscar</button>
            <button type="button" className="secondary" onClick={clear}>Limpiar filtros</button>
          </div>
        </form>

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
    </section>
  )
}
