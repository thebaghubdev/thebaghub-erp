import { createContext } from 'react'

export type AuthUser = {
  id: string
  username: string
  userType: string
  isAdmin: boolean
  employee: {
    firstName: string
    lastName: string
    position: string
  } | null
}

export type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
