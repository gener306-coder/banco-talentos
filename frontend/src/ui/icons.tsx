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
// Reporte ejecutivo (HU-S7-01).
export const ChartIcon = () => <Icon><path d="M2 13.5h12M4 11V7.5M7 11V4M10 11V6M13 11V2.5" /></Icon>
// Bitácora (HU-S7-03).
export const ClipboardIcon = () => <Icon><rect x="3" y="2.5" width="10" height="11.5" rx="1.5" /><path d="M6 2.5V2h4v.5M5.5 6.5h5M5.5 9h5M5.5 11.5h3" /></Icon>
export const IdCardIcon = () => <Icon><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><circle cx="5.5" cy="7.5" r="1.5" /><path d="M3.5 11c.4-1 1.1-1.5 2-1.5s1.6.5 2 1.5M9.5 6.5h3M9.5 9h3" /></Icon>
// Login (T-S8-04): campos de correo y contraseña, y mostrar u ocultar la contraseña.
export const PlayIcon = () => <Icon><path d="M5 3.2v9.6L12.5 8 5 3.2Z" fill="currentColor" /></Icon>
export const PauseIcon = () => <Icon><path d="M5.5 3.5v9M10.5 3.5v9" /></Icon>
export const VolumeIcon = () => <Icon><path d="M2.5 6.2v3.6h2.3L8 12.5v-9L4.8 6.2H2.5ZM10.5 6a2.8 2.8 0 0 1 0 4M12.3 4.3a5.3 5.3 0 0 1 0 7.4" /></Icon>
export const VolumeOffIcon = () => <Icon><path d="M2.5 6.2v3.6h2.3L8 12.5v-9L4.8 6.2H2.5ZM10.8 6.2l3 3.6M13.8 6.2l-3 3.6" /></Icon>
export const FullscreenIcon = () => <Icon><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></Icon>
export const ExitFullscreenIcon = () => <Icon><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" /></Icon>
export const ReplayIcon = () => <Icon><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" /></Icon>
export const UploadIcon = () => <Icon><path d="M8 10.5V2.5M4.8 5.5 8 2.5l3.2 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" /></Icon>
export const PencilIcon = () => <Icon><path d="M10.5 3.5 12.5 5.5M3 13l.6-2.6 7.6-7.6a1.4 1.4 0 0 1 2 2l-7.6 7.6L3 13Z" /></Icon>
export const TrashIcon = () => <Icon><path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.6a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.6M6.8 7v4.5M9.2 7v4.5" /></Icon>
export const ShuffleIcon = () => <Icon><path d="M2 4.5h2.5c3.5 0 3.5 7 7 7H14M2 11.5h2.5c1.4 0 2.2-1.1 2.8-2.5M9 6.5c.6-1.1 1.4-2 2.5-2H14M12 2.5l2 2-2 2M12 9.5l2 2-2 2" /></Icon>
export const VideoIcon = () => <Icon><rect x="1.5" y="3.5" width="9.5" height="9" rx="1.5" /><path d="m11 7 3.5-2v6L11 9" /></Icon>
export const KeyIcon = () => <Icon><circle cx="5.5" cy="10.5" r="3" /><path d="m7.6 8.4 5.9-5.9M11.5 4.5l1.5 1.5M9.8 6.2l1.3 1.3" /></Icon>
export const PhoneIcon = () => <Icon><path d="M5.6 2.5H3.8a1.3 1.3 0 0 0-1.3 1.4c.5 5.2 4.4 9.1 9.6 9.6a1.3 1.3 0 0 0 1.4-1.3v-1.8l-2.6-1.1-1.4 1.4a8 8 0 0 1-3.4-3.4L7.5 5.9 6.4 3.3Z" /></Icon>
export const MailIcon = () => <Icon><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><path d="m2 4.5 6 4.5 6-4.5" /></Icon>
export const EyeIcon = () => <Icon><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></Icon>
export const EyeOffIcon = () => <Icon><path d="M6.6 3.7A6 6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.7 2.2M4.2 4.8C2.5 6 1.5 8 1.5 8S4 12.5 8 12.5a6 6 0 0 0 3.2-.9M6.6 6.6a2 2 0 0 0 2.8 2.8M2 2l12 12" /></Icon>
export const MessageIcon = () => <Icon><path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v5.5A1.5 1.5 0 0 1 12 11H7l-3 2.5V11a1.5 1.5 0 0 1-1.5-1.5Z" /><path d="M5.5 5.5h5M5.5 8h3" /></Icon>
export const ExternalIcon = () => <Icon><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></Icon>
