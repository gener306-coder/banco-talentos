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
