import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (!token) {
    return (
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    )
  }

  return children
}
