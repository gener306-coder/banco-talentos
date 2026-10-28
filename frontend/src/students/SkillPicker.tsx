import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { searchSkills } from './cv'
import type { CvSkill, SkillInput } from './cv'
import { catalogSlug, displayName, hasContactInformation, SKILL_KINDS } from './cvCatalogs'
import type { SkillKind } from './cvCatalogs'
import { FieldError } from './CvShared'

const SEARCH_DELAY_MS = 200

type Option = { type: 'catalog'; skill: CvSkill } | { type: 'new'; name: string }

interface SkillPickerProps {
  /** Prefijo de los id del marcado; único por página. */
  idPrefix: string
  skills: SkillInput[]
  onChange: (skills: SkillInput[]) => void
  max: number
  disabled: boolean
  /** Errores del servidor sobre la lista; los locales tienen prioridad. */
  serverError: string | null
  /** Mensaje cuando el nombre lleva datos de contacto (CA-02 de HU-S3-01, CA-04 de HU-S5-02). */
  contactMessage: string
  placeholder: string
}

/**
 * Habilidades como etiquetas removibles con autocompletado del catálogo compartido (HU-S3-01 CA-01), reutilizado
 * por las oportunidades duales (HU-S5-02). Una habilidad del catálogo conserva su tipo; una nueva toma el elegido.
 */
export function SkillPicker({ idPrefix, skills, onChange, max, disabled, serverError, contactMessage, placeholder }: SkillPickerProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CvSkill[]>([])
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const [newKind, setNewKind] = useState<SkillKind>('technical')
  const [localError, setLocalError] = useState<string | null>(null)
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
  const error = localError ?? serverError

  function add(skill: SkillInput) {
    const name = displayName(skill.name)
    const message = !name ? null
      : chosen.has(catalogSlug(name)) ? 'Esta habilidad ya está en la lista.'
      : skills.length >= max ? `Registra como máximo ${max} habilidades.`
      : name.length > 80 ? 'El nombre de la habilidad no debe superar 80 caracteres.'
      : hasContactInformation(name) ? contactMessage
      : null
    setLocalError(message)
    if (message || !name) return
    onChange([...skills, { name, kind: skill.kind }])
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

  return (
    <>
      {SKILL_KINDS.map((kind) => {
        const group = skills.map((skill, index) => ({ skill, index })).filter(({ skill }) => skill.kind === kind.value)
        return (
          <div key={kind.value} className="chip-group">
            <h4 id={`${idPrefix}-skills-${kind.value}`}>{kind.plural}</h4>
            {group.length
              ? (
                <ul className="chips" aria-labelledby={`${idPrefix}-skills-${kind.value}`}>
                  {group.map(({ skill, index }) => (
                    <li key={catalogSlug(skill.name)} className={`chip ${skill.kind}`}>
                      <span>{skill.name}</span>
                      <button type="button" className="chip-remove" aria-label={`Quitar ${skill.name}`} disabled={disabled}
                        onClick={() => { onChange(skills.filter((_, position) => position !== index)); setLocalError(null) }}>
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

      <label htmlFor={`${idPrefix}-skill-search`}>Agregar habilidad</label>
      <div className="combobox">
        <input id={`${idPrefix}-skill-search`} type="text" autoComplete="off" role="combobox" disabled={disabled}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${idPrefix}-skills-hint ${idPrefix}-skills-error` : `${idPrefix}-skills-hint`}
          value={query} placeholder={placeholder}
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
      <p className="field-hint" id={`${idPrefix}-skills-hint`}>{skills.length} de {max} habilidades · Enter para agregar</p>
      <fieldset className="choice-group inline" disabled={disabled}>
        <legend>Tipo para una habilidad nueva</legend>
        {SKILL_KINDS.map((kind) => (
          <div key={kind.value}>
            <input id={`${idPrefix}-skill-kind-${kind.value}`} type="radio" name={`${idPrefix}-skill-kind`} value={kind.value}
              checked={newKind === kind.value} onChange={() => setNewKind(kind.value)} />
            <label htmlFor={`${idPrefix}-skill-kind-${kind.value}`}>{kind.label}</label>
          </div>
        ))}
      </fieldset>
      <FieldError id={`${idPrefix}-skills-error`} messages={error} />
    </>
  )
}
