import { useMemo } from 'react'
import { usePortalAuth } from '../context/portal-auth'
import {
  canEditFeature,
  canViewFeature,
  type FeatureKey,
} from './feature-access'

export function useFeatureAccess(featureKey: FeatureKey) {
  const { user, featureAccess } = usePortalAuth()
  return useMemo(() => {
    const canView = canViewFeature(user?.isAdmin, featureAccess, featureKey)
    const canEdit = canEditFeature(user?.isAdmin, featureAccess, featureKey)
    return {
      canView,
      canEdit,
      readOnly: canView && !canEdit,
    }
  }, [user?.isAdmin, featureAccess, featureKey])
}
