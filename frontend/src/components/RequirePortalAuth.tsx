import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { usePortalAuth } from '../context/portal-auth'

/** Staff/ERP shell only: client accounts must use the client app (`/login`), never portal pages. */
export function RequirePortalAuth({ children }: { children: ReactNode }) {
  const { token, user, loading } = usePortalAuth()
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
      <Navigate
        to="/portal/login"
        state={{ from: location.pathname }}
        replace
      />
    )
  }

  if (user?.userType === 'client') {
    return <Navigate to="/login" replace />
  }

  return children
}
