import { createContext, useContext } from 'react'
import type { SnackbarOptions } from './useSnackbar'

export type Notify = (text: string, options?: SnackbarOptions) => void

export const SnackbarContext = createContext<Notify | null>(null)

/** Aviso breve global (T-S14-17); fuera del proveedor no hace nada. */
export function useGlobalSnackbar(): Notify {
  return useContext(SnackbarContext) ?? (() => undefined)
}
