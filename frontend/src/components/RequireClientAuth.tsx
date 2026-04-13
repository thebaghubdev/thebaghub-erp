import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useClientAuth } from '../context/client-auth'

export function RequireClientAuth({ children }: { children: ReactNode }) {
  const { token, user, loading } = useClientAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50 text-slate-700">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (!token) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    )
  }

  if (user && user.userType !== 'client') {
    return <Navigate to="/portal/inquiries" replace />
  }

  return children
}
