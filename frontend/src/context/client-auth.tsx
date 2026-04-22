import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../lib/api'
import { normalizeClientProfile, type AuthUser } from './auth-user'

const STORAGE_TOKEN = 'baghub_client_token'
const STORAGE_USER = 'baghub_client_user'

type ClientAuthContextValue = {
  token: string | null
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const ClientAuthContext = createContext<ClientAuthContextValue | null>(null)

function parseStoredUser(raw: string | null): AuthUser | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>
    if (!parsed.id || !parsed.username) return null
    return {
      id: parsed.id,
      username: parsed.username,
      userType: parsed.userType ?? 'client',
      isAdmin: Boolean(parsed.isAdmin),
      employee: parsed.employee ?? null,
      client: normalizeClientProfile(parsed.client),
    }
  } catch {
    return null
  }
}

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_TOKEN) : null,
  )
  const [user, setUser] = useState<AuthUser | null>(() =>
    typeof window !== 'undefined'
      ? parseStoredUser(localStorage.getItem(STORAGE_USER))
      : null,
  )
  const [loading, setLoading] = useState(!!token)

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!token) return
    try {
      const res = await apiFetch('/api/auth/me', {}, token)
      if (!res.ok) return
      const me = (await res.json()) as AuthUser
      setUser({
        ...me,
        client: normalizeClientProfile(me.client),
      })
      localStorage.setItem(STORAGE_USER, JSON.stringify(me))
    } catch {
      // ignore; keep stale user until next navigation
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/auth/me', {}, token)
        if (!res.ok) {
          if (!cancelled) logout()
          return
        }
        const me = (await res.json()) as AuthUser
        if (!cancelled) {
          setUser({
            ...me,
            client: normalizeClientProfile(me.client),
          })
          localStorage.setItem(STORAGE_USER, JSON.stringify(me))
        }
      } catch {
        if (!cancelled) logout()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, logout])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = body?.message
      const text = Array.isArray(msg)
        ? msg.join(', ')
        : typeof msg === 'string'
          ? msg
          : 'Login failed'
      throw new Error(text)
    }
    const accessToken = body.access_token as string
    const u = body.user as AuthUser
    if (u.userType !== 'client') {
      throw new Error('This account cannot sign in here. Use the staff portal.')
    }
    localStorage.setItem(STORAGE_TOKEN, accessToken)
    localStorage.setItem(STORAGE_USER, JSON.stringify(u))
    setToken(accessToken)
    setUser({
      ...u,
      client: normalizeClientProfile(u.client),
    })
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      logout,
      refreshUser,
    }),
    [token, user, loading, login, logout, refreshUser],
  )

  return (
    <ClientAuthContext.Provider value={value}>
      {children}
    </ClientAuthContext.Provider>
  )
}

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext)
  if (!ctx) {
    throw new Error('useClientAuth must be used within ClientAuthProvider')
  }
  return ctx
}
