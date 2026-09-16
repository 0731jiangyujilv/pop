import { useContext } from 'react'
import { AuthContext, type AuthState } from '@/contexts/AuthContext'

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
