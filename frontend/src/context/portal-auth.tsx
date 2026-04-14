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

const STORAGE_TOKEN = 'baghub_portal_token'
const STORAGE_USER = 'baghub_portal_user'

type PortalAuthContextValue = {
  token: string | null
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null)

function parseStoredUser(raw: string | null): AuthUser | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>
    if (!parsed.id || !parsed.username) return null
    return {
      id: parsed.id,
      username: parsed.username,
      userType: parsed.userType ?? 'employee',
      isAdmin: Boolean(parsed.isAdmin),
      employee: parsed.employee ?? null,
      client: normalizeClientProfile(parsed.client),
    }
  } catch {
    return null
  }
}

/** Drop portal storage if it was ever written with a client profile (wrong realm). */
function initialPortalSession(): { token: string | null; user: AuthUser | null } {
  if (typeof window === 'undefined') {
    return { token: null, user: null }
  }
  const rawUser = localStorage.getItem(STORAGE_USER)
  const parsed = parseStoredUser(rawUser)
  const t = localStorage.getItem(STORAGE_TOKEN)
  if (parsed?.userType === 'client') {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    return { token: null, user: null }
  }
  return { token: t, user: parsed }
}

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => initialPortalSession())
  const [token, setToken] = useState<string | null>(session.token)
  const [user, setUser] = useState<AuthUser | null>(session.user)
  const [loading, setLoading] = useState(!!session.token)

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    setToken(null)
    setUser(null)
  }, [])

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
        if (me.userType === 'client') {
          if (!cancelled) logout()
          return
        }
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
      throw new Error(
        typeof body?.message === 'string' ? body.message : 'Login failed',
      )
    }
    const accessToken = body.access_token as string
    const u = body.user as AuthUser
    if (u.userType === 'client') {
      throw new Error('Use the client portal to sign in with this account.')
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
    }),
    [token, user, loading, login, logout],
  )

  return (
    <PortalAuthContext.Provider value={value}>
      {children}
    </PortalAuthContext.Provider>
  )
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext)
  if (!ctx) {
    throw new Error('usePortalAuth must be used within PortalAuthProvider')
  }
  return ctx
}
