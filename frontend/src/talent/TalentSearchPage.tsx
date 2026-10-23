import { useCallback, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiRequest } from '../lib/useApiRequest'
import { MAX_PERIOD, MEXICAN_STATES } from '../students/catalogs'
import { CV_LANGUAGES, displayName, LANGUAGE_LEVELS } from '../students/cvCatalogs'
import { MunicipalityCombobox } from '../students/MunicipalityCombobox'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { LoadingState, StateMessage } from '../ui/StateMessage'
import { emptyFilters, MAX_SKILL_FILTERS, RADII_KM, searchTalent, talentMessages } from './api'
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
  const [draft, setDraft] = useState<TalentFilters>(emptyFilters)
  const [applied, setApplied] = useState<TalentFilters>(emptyFilters)
  const [page, setPage] = useState(1)
  const [skillText, setSkillText] = useState('')
  const [skillError, setSkillError] = useState<string | null>(null)
  const [originMode, setOriginMode] = useState<'company' | 'other'>('company')
  const [originState, setOriginState] = useState('')
  const [originError, setOriginError] = useState<string | null>(null)
  const load = useCallback((signal: AbortSignal) => searchTalent(applied, page, signal), [applied, page])
  const { data, loading, failure, refresh } = useApiRequest(load, talentMessages)

  function set<K extends keyof TalentFilters>(field: K, value: TalentFilters[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function addSkill() {
    const name = displayName(skillText)
    if (!name) return
    const message = draft.skills.some((skill) => skill.toLowerCase() === name.toLowerCase()) ? 'Esta habilidad ya está en los filtros.'
      : draft.skills.length >= MAX_SKILL_FILTERS ? `Filtra como máximo por ${MAX_SKILL_FILTERS} habilidades.`
      : name.length > 80 ? 'Cada habilidad debe tener como máximo 80 caracteres.'
      : null
    setSkillError(message)
    if (message) return
    set('skills', [...draft.skills, name])
    setSkillText('')
  }

  function onSkillKey(event: KeyboardEvent<HTMLInputElement>) {
    // Enter agrega la habilidad; no lanza la búsqueda.
    if (event.key === 'Enter') {
      event.preventDefault()
      addSkill()
    }
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
    setSkillText('')
    setSkillError(null)
    setOriginError(null)
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
            <legend>Habilidades</legend>
            <label htmlFor="talent-skill">Agregar habilidad (todas requeridas)</label>
            <div className="talent-skill-input">
              <input id="talent-skill" type="text" maxLength={80} value={skillText} autoComplete="off"
                aria-invalid={Boolean(skillError)} aria-describedby={skillError ? 'talent-skill-error' : undefined}
                onChange={(event) => { setSkillText(event.target.value); setSkillError(null) }} onKeyDown={onSkillKey} />
              <button type="button" className="secondary" aria-label="Agregar habilidad" onClick={addSkill}><PlusIcon /></button>
            </div>
            {skillError && <p className="field-error" id="talent-skill-error">{skillError}</p>}
            {draft.skills.length > 0 && (
              <ul className="chips" aria-label="Habilidades requeridas">
                {draft.skills.map((skill) => (
                  <li key={skill} className="chip"><span>{skill}</span>
                    <button type="button" className="chip-remove" aria-label={`Quitar ${skill}`}
                      onClick={() => set('skills', draft.skills.filter((item) => item !== skill))}><CloseIcon /></button>
                  </li>
                ))}
              </ul>
            )}
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
            <label htmlFor="talent-program">Carrera</label>
            <input id="talent-program" type="text" maxLength={150} value={draft.program} onChange={(event) => set('program', event.target.value)} />
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
