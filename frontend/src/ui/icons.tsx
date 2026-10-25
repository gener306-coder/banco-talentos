import type { ReactNode } from 'react'

// Iconos de trazo en línea: heredan el color del texto y no se anuncian (el texto del control ya los nombra).
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export const ChevronLeftIcon = () => <Icon><path d="M10 3 5 8l5 5" /></Icon>
export const ChevronRightIcon = () => <Icon><path d="m6 3 5 5-5 5" /></Icon>
export const PlusIcon = () => <Icon><path d="M8 3v10M3 8h10" /></Icon>
export const CopyIcon = () => <Icon><rect x="5" y="5" width="8" height="8" rx="2" /><path d="M3 10.5V4.5A1.5 1.5 0 0 1 4.5 3h6" /></Icon>
export const CheckIcon = () => <Icon><path d="m3.5 8.5 3 3 6-7" /></Icon>
export const AlertIcon = () => <Icon><path d="M8 2.5 14 13H2L8 2.5Z" /><path d="M8 7v2.5M8 11.2h.01" /></Icon>
export const BuildingIcon = () => <Icon><path d="M3 13.5h10M4.5 13.5V5L8 2.5 11.5 5v8.5M7 13.5V10h2v3.5M6.5 6.5h.01M9.5 6.5h.01" /></Icon>
export const SearchIcon = () => <Icon><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></Icon>
export const CloseIcon = () => <Icon><path d="m4 4 8 8M12 4l-8 8" /></Icon>
export const LockIcon = () => <Icon><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Icon>
// Inicio por rol: alumnos y personal, empresas y cuentas de acceso.
export const UsersIcon = () => <Icon><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 3.2a2.4 2.4 0 0 1 0 4.6M12.5 9.7c1.3.5 2 1.8 2 3.8" /></Icon>
export const BriefcaseIcon = () => <Icon><rect x="1.5" y="4.5" width="13" height="9" rx="1.5" /><path d="M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M1.5 8.5h13" /></Icon>
export const IdCardIcon = () => <Icon><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><circle cx="5.5" cy="7.5" r="1.5" /><path d="M3.5 11c.4-1 1.1-1.5 2-1.5s1.6.5 2 1.5M9.5 6.5h3M9.5 9h3" /></Icon>
