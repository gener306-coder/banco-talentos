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
}

export const AuthContext = createContext<AuthState | null>(null)
