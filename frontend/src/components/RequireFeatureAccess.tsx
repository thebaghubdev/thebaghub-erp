import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePortalAuth } from '../context/portal-auth'
import { canViewFeature, type FeatureKey } from '../lib/feature-access'

export function RequireFeatureAccess({
  feature,
  children,
}: {
  feature: FeatureKey
  children: ReactNode
}) {
  const { user, featureAccess, featureAccessLoading } = usePortalAuth()
  const location = useLocation()

  if (featureAccessLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (!canViewFeature(user?.isAdmin, featureAccess, feature)) {
    return (
      <Navigate
        to="/portal/unauthorized"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return children
}
