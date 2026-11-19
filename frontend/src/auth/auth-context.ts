import { createContext } from 'react'
import type { ApiError } from '../lib/http'
import type { User } from './api'

export interface AuthState {
  status: 'loading' | 'ready' | 'error' | 'forbidden'
  user: User | null
  message: string | null
  pending: boolean
  restore: () => Promise<void>
  expireSession: (error?: ApiError) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Refleja en la sesión la identidad actualizada (HU-S14-01), sin volver a consultarla ni pasar por la carga. */
  updateUser: (user: User) => void
}

export const AuthContext = createContext<AuthState | null>(null)
