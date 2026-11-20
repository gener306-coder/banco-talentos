import type { ReactNode } from 'react'
import { SnackbarContext } from './snackbarContext'
import { useSnackbar } from './useSnackbar'

/**
 * T-S14-17: aviso breve global, para lo que no pertenece a una pantalla (por ejemplo, un mensaje nuevo que llega
 * mientras se navega). Las pantallas con sus propias confirmaciones siguen usando `useSnackbar`.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [node, notify] = useSnackbar()
  return (
    <SnackbarContext.Provider value={notify}>
      {children}
      {node}
    </SnackbarContext.Provider>
  )
}
