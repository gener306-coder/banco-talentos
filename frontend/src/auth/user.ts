import type { User } from './api'

/** Organización visible de la cuenta: su institución o empresa vinculada, si tiene. */
export function organizationOf(user: User): string | null {
  return user.institution?.name ?? user.company?.name ?? null
}

/** Hasta dos iniciales del nombre, para el botón del menú. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
