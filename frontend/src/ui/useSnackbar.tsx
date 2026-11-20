import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Snackbar } from './Snackbar'

export interface SnackbarOptions {
  icon?: ReactNode
  action?: { label: string; onClick: () => void }
}

/** Un aviso a la vez: mostrar otro reemplaza al anterior y reinicia su tiempo. */
export function useSnackbar() {
  const [item, setItem] = useState<{ id: number; text: string; options?: SnackbarOptions } | null>(null)
  const notify = useCallback((text: string, options?: SnackbarOptions) => setItem((current) => ({ id: (current?.id ?? 0) + 1, text, options })), [])
  const dismiss = useCallback(() => setItem(null), [])
  const node = item ? <Snackbar key={item.id} text={item.text} onDone={dismiss} icon={item.options?.icon} action={item.options?.action} /> : null
  return [node, notify] as const
}
