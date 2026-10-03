import { createContext } from 'react'

export type AuthState = {
  isAuthenticated: boolean
  isSigningIn: boolean
  address: string | null
  chainId: number | null
  signIn: () => Promise<void>
  signOut: () => void
}

export const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isSigningIn: false,
  address: null,
  chainId: null,
  signIn: async () => {},
  signOut: () => {},
})
