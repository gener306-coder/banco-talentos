import { useCallback, useState } from 'react'
import { Snackbar } from './Snackbar'

/** Un aviso a la vez: mostrar otro reemplaza al anterior y reinicia su tiempo. */
export function useSnackbar() {
  const [item, setItem] = useState<{ id: number; text: string } | null>(null)
  const notify = useCallback((text: string) => setItem((current) => ({ id: (current?.id ?? 0) + 1, text })), [])
  const dismiss = useCallback(() => setItem(null), [])
  const node = item ? <Snackbar key={item.id} text={item.text} onDone={dismiss} /> : null
  return [node, notify] as const
}
