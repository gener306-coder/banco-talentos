import { useEffect, useId, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { InstitutionRequestError } from '../institutions/InstitutionLayout'
import { useApiMutation } from '../lib/useApiRequest'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { searchSkills, updateSkills } from './cv'
import type { CvSkill, SkillInput, StudentCv } from './cv'
import { catalogSlug, CONTACT_MESSAGE, CV_LIMITS, displayName, hasContactInformation, SKILL_KINDS } from './cvCatalogs'
import type { SkillKind } from './cvCatalogs'
import { FieldError, SaveBar } from './CvShared'
import { studentMessages } from './messages'

const SEARCH_DELAY_MS = 200

type Option = { type: 'catalog'; skill: CvSkill } | { type: 'new'; name: string }

/**
 * Habilidades como etiquetas removibles con autocompletado del catálogo compartido (HU-S3-01 CA-01).
 * Una habilidad del catálogo conserva su tipo; una nueva toma el tipo elegido.
 */
export function CvSkillsSection({ studentId, cv, onSaved }: { studentId: number; cv: StudentCv; onSaved: (cv: StudentCv) => void }) {
  const [skills, setSkills] = useState<SkillInput[]>(() => cv.public.skills.map(({ name, kind }) => ({ name, kind })))
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CvSkill[]>([])
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const [newKind, setNewKind] = useState<SkillKind>('technical')
  const [localError, setLocalError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const mutation = useApiMutation(studentMessages)
  const listId = useId()
  const term = displayName(query)

  // Consulta el catálogo cuando la búsqueda se detiene; cada nueva búsqueda cancela la anterior.
  useEffect(() => {
    if (!term) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchSkills(term, controller.signal)
        .then((results) => { setSuggestions(results); setActive(results.length ? 0 : -1) })
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]) })
    }, SEARCH_DELAY_MS)
    return () => { clearTimeout(timer); controller.abort() }
  }, [term])

  const chosen = new Set(skills.map((skill) => catalogSlug(skill.name)))
  const catalogOptions: Option[] = term ? suggestions.filter((skill) => !chosen.has(catalogSlug(skill.name))).map((skill) => ({ type: 'catalog', skill })) : []
  const exact = suggestions.some((skill) => catalogSlug(skill.name) === catalogSlug(term))
  const options: Option[] = term && !exact && !chosen.has(catalogSlug(term)) ? [...catalogOptions, { type: 'new', name: term }] : catalogOptions
  const expanded = open && options.length > 0
  const serverErrors = Object.entries(mutation.failure?.errors ?? {}).filter(([key]) => key.startsWith('skills')).flatMap(([, messages]) => messages)
  const error = localError ?? (serverErrors.length ? [...new Set(serverErrors)].join(' ') : null)

  function change(next: SkillInput[]) {
    setSkills(next)
    setSaved(false)
  }

  function add(skill: SkillInput) {
    const name = displayName(skill.name)
    const message = !name ? null
      : chosen.has(catalogSlug(name)) ? 'Esta habilidad ya está en la lista.'
      : skills.length >= CV_LIMITS.skills ? `Registra como máximo ${CV_LIMITS.skills} habilidades.`
      : name.length > 80 ? 'El nombre de la habilidad no debe superar 80 caracteres.'
      : hasContactInformation(name) ? CONTACT_MESSAGE
      : null
    setLocalError(message)
    if (message || !name) return
    change([...skills, { name, kind: skill.kind }])
    setQuery('')
    setSuggestions([])
    setActive(-1)
    setOpen(false)
  }

  function choose(option: Option) {
    add(option.type === 'catalog' ? option.skill : { name: option.name, kind: newKind })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!options.length) return
      setOpen(true)
      setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Enter') {
      // Enter agrega la habilidad; no envía el formulario.
      event.preventDefault()
      const option = expanded && active >= 0 ? options[active] : null
      if (option) choose(option)
      else if (term) add({ name: term, kind: newKind })
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      setOpen(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.pending) return
    setSaved(false)
    setLocalError(null)
    await mutation.submit(() => updateSkills(studentId, skills), (updated) => {
      setSkills(updated.public.skills.map(({ name, kind }) => ({ name, kind })))
      setSaved(true)
      onSaved(updated)
    })
  }

  return (
    <section className="student-section cv-section" aria-labelledby="cv-skills-title">
      <h3 id="cv-skills-title">Habilidades</h3>
      <p>Técnicas y blandas. Escribe para buscar en el catálogo compartido; si no existe, agrégala como nueva.</p>
      <form onSubmit={(event) => { void submit(event) }} aria-busy={mutation.pending} noValidate>
        {mutation.failure && mutation.failure.status !== 422 && <InstitutionRequestError failure={mutation.failure} />}
        {SKILL_KINDS.map((kind) => {
          const group = skills.map((skill, index) => ({ skill, index })).filter(({ skill }) => skill.kind === kind.value)
          return (
            <div key={kind.value} className="chip-group">
              <h4 id={`cv-skills-${kind.value}`}>{kind.plural}</h4>
              {group.length
                ? (
                  <ul className="chips" aria-labelledby={`cv-skills-${kind.value}`}>
                    {group.map(({ skill, index }) => (
                      <li key={catalogSlug(skill.name)} className={`chip ${skill.kind}`}>
                        <span>{skill.name}</span>
                        <button type="button" className="chip-remove" aria-label={`Quitar ${skill.name}`} disabled={mutation.pending}
                          onClick={() => { change(skills.filter((_, position) => position !== index)); setLocalError(null) }}>
                          <CloseIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="notice-muted">Sin habilidades {kind.plural.toLowerCase()}.</p>}
            </div>
          )
        })}

        <label htmlFor="cv-skill-search">Agregar habilidad</label>
        <div className="combobox">
          <input id="cv-skill-search" type="text" autoComplete="off" role="combobox" disabled={mutation.pending}
            aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={Boolean(error)} aria-describedby={error ? 'cv-skills-hint cv-skills-error' : 'cv-skills-hint'}
            value={query} placeholder="Ej. React, Contabilidad de costos, Trabajo en equipo"
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setLocalError(null); if (!displayName(event.target.value)) setSuggestions([]) }}
            onKeyDown={onKeyDown} onBlur={() => setOpen(false)} onFocus={() => setOpen(true)} />
          <ul id={listId} role="listbox" aria-label="Sugerencias de habilidades" className="combobox-list" hidden={!expanded}>
            {options.map((option, index) => (
              <li key={option.type === 'catalog' ? `c-${option.skill.id}` : 'new'} id={`${listId}-${index}`} role="option"
                aria-selected={index === active} className={index === active ? 'active' : undefined}
                // mousedown evita que el blur del campo cierre la lista antes del clic.
                onMouseDown={(event) => { event.preventDefault(); choose(option) }}>
                {option.type === 'catalog'
                  ? <><span>{option.skill.name}</span><span className="option-meta">{SKILL_KINDS.find((kind) => kind.value === option.skill.kind)?.label}</span></>
                  : <><PlusIcon /><span>Agregar «{option.name}» como nueva</span><span className="option-meta">{SKILL_KINDS.find((kind) => kind.value === newKind)?.label}</span></>}
              </li>
            ))}
          </ul>
        </div>
        <p className="field-hint" id="cv-skills-hint">{skills.length} de {CV_LIMITS.skills} habilidades · Enter para agregar</p>
        <fieldset className="choice-group inline" disabled={mutation.pending}>
          <legend>Tipo para una habilidad nueva</legend>
          {SKILL_KINDS.map((kind) => (
            <div key={kind.value}>
              <input id={`cv-skill-kind-${kind.value}`} type="radio" name="cv-skill-kind" value={kind.value}
                checked={newKind === kind.value} onChange={() => setNewKind(kind.value)} />
              <label htmlFor={`cv-skill-kind-${kind.value}`}>{kind.label}</label>
            </div>
          ))}
        </fieldset>
        <FieldError id="cv-skills-error" messages={error} />
        <SaveBar pending={mutation.pending} saved={saved} label="Guardar habilidades" pendingLabel="Guardando habilidades…" savedLabel="Habilidades guardadas correctamente." />
      </form>
    </section>
  )
}
