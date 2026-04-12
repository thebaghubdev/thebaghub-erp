import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from '../lib/api'
import { AuthContext, type AuthUser } from './auth-context'

const STORAGE_TOKEN = 'baghub_access_token'
const STORAGE_USER = 'baghub_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_TOKEN) : null,
  )
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_USER)
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
      }
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(!!token)

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
        if (!cancelled) {
          setUser(me)
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
        typeof body?.message === 'string'
          ? body.message
          : 'Login failed',
      )
    }
    const accessToken = body.access_token as string
    const u = body.user as AuthUser
    localStorage.setItem(STORAGE_TOKEN, accessToken)
    localStorage.setItem(STORAGE_USER, JSON.stringify(u))
    setToken(accessToken)
    setUser(u)
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
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}
