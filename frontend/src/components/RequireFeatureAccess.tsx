import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePortalAuth } from '../context/portal-auth'
import { canViewFeature, type FeatureKey } from '../lib/feature-access'

export function RequireFeatureAccess({
  feature,
  orFeatures = [],
  children,
}: {
  feature: FeatureKey
  orFeatures?: FeatureKey[]
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

  const allowed =
    canViewFeature(user?.isAdmin, featureAccess, feature) ||
    orFeatures.some((key) => canViewFeature(user?.isAdmin, featureAccess, key))

  if (!allowed) {
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
