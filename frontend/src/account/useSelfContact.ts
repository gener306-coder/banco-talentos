import { useState } from 'react'
import { useAuth } from '../auth/useAuth'

const sameEmail = (a: string | null, b: string) => a !== null && a.trim().toLowerCase() === b.toLowerCase()

/**
 * «Soy yo» del contacto de la organización (HU-S14-03, T-S14-09; T-S14-15 lo extiende a la institución). El formulario
 * sigue siendo dueño de sus valores; este hook lleva la casilla, el nombre con el que se abrió el formulario y la
 * sincronización con el nombre de la cuenta:
 * - la casilla refleja el contacto guardado: es la persona de la sesión si su correo es el de la cuenta;
 * - marcarla precarga el nombre y el correo de la cuenta; desmarcarla los vacía para asignar a otra persona;
 * - el nombre solo viaja como `account_name` si se corrigió en este formulario: una copia vieja nunca revierte la cuenta;
 * - si la persona se renombra con el formulario abierto, el campo que no ha tocado sigue al nombre nuevo.
 */
export function useSelfContact({ savedEmail, initialName, currentName, suggest = false, fill }: {
  /** Correo del contacto guardado. */
  savedEmail: string | null
  /** Nombre del contacto con el que se abre el formulario. */
  initialName: string
  /** Valor actual del campo del nombre del contacto. */
  currentName: string
  /** Proponer «Soy yo» aunque no coincida el correo (onboarding con el contacto vacío). */
  suggest?: boolean
  /** Escribe en el formulario el nombre y el correo del contacto. */
  fill: (contact: { name?: string; email?: string }) => void
}) {
  const { user } = useAuth()
  const accountEmail = user?.email ?? ''
  // M3: el nombre provisional (el correo) no se propone como nombre de nadie.
  const accountName = user && user.name !== user.email ? user.name : ''
  const [self, setSelf] = useState(() => suggest || sameEmail(savedEmail, accountEmail))
  const [baseName, setBaseName] = useState(initialName)

  // Ajuste durante el render (no en un efecto): el nombre de la cuenta cambió con el formulario abierto.
  const [seenAccountName, setSeenAccountName] = useState(accountName)
  if (seenAccountName !== accountName) {
    setSeenAccountName(accountName)
    if (self && accountName && currentName === baseName) {
      fill({ name: accountName })
      setBaseName(accountName)
    }
  }

  return {
    self,
    accountName,
    accountEmail,
    toggle(checked: boolean) {
      setSelf(checked)
      fill({ name: checked ? accountName : '', email: checked ? accountEmail : '' })
    },
    /** El nombre que debe viajar como `account_name`, o null si no se corrigió aquí. */
    accountNameFor(contactName: string | null): string | null {
      return self && contactName !== null && contactName !== baseName.trim() ? contactName : null
    },
    /** Tras guardar: la casilla y el nombre base siguen al contacto guardado. */
    saved(contact: { name: string | null; email: string | null }) {
      setBaseName(contact.name ?? '')
      setSelf(sameEmail(contact.email, accountEmail))
    },
  }
}
