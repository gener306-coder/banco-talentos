import { Link } from 'react-router'
import { periodLabel, stateName } from '../students/catalogs'
import { languageName, levelLabel } from '../students/cvCatalogs'
import { ChevronRightIcon } from '../ui/icons'
import { distanceLabel } from './api'
import type { TalentCard } from './api'

/** Datos comunes de la tarjeta y del perfil: formación, institución, ubicación y disponibilidad. */
export function TalentFacts({ card }: { card: TalentCard }) {
  const place = [card.municipality, stateName(card.stateCode)].filter(Boolean).join(', ')
  return (
    <dl className="talent-facts">
      <div><dt>Formación</dt><dd>{card.program} · {periodLabel(card.periodType, card.periodNumber)}</dd></div>
      <div><dt>Institución</dt><dd>{card.institution}</dd></div>
      <div><dt>Ubicación</dt><dd>{place} · {distanceLabel(card.distanceKm)}</dd></div>
      <div><dt>Disponibilidad</dt><dd>
        {card.dualAvailable ? 'Disponible para el programa dual' : 'Sin disponibilidad dual por ahora'}
        {' · '}{card.canRelocate ? 'Puede reubicarse' : 'No puede reubicarse'}
      </dd></div>
    </dl>
  )
}

export function SkillChips({ skills, label }: { skills: TalentCard['skills']; label: string }) {
  if (!skills.length) return null
  return (
    <ul className="chips" aria-label={label}>
      {skills.map((skill) => <li key={skill.name} className={`chip${skill.kind === 'soft' ? ' soft' : ''}`}><span>{skill.name}</span></li>)}
    </ul>
  )
}

/** Tarjeta anónima de un perfil (HU-S4-05 CA-05). Sin datos de identidad ni acciones de contacto. */
export function TalentCardView({ card }: { card: TalentCard }) {
  const title = card.headline ?? 'Perfil sin titular'
  const titleId = `talent-${card.publicId}`
  return (
    <article className="talent-card" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <TalentFacts card={card} />
      <SkillChips skills={card.skills} label={`Habilidades principales de ${title}`} />
      <p className="talent-meta">
        {card.languages.length
          ? card.languages.map((language) => `${languageName(language.languageCode)} ${levelLabel(language.level)}`).join(' · ')
          : 'Sin idiomas registrados'}
        {' · '}
        {card.verifiedCertifications === 1 ? '1 certificación revisada' : `${card.verifiedCertifications} certificaciones revisadas`}
      </p>
      <Link className="pill-link" to={`/talent/${card.publicId}`} aria-label={`Ver perfil: ${title}`}>Ver perfil<ChevronRightIcon /></Link>
    </article>
  )
}
