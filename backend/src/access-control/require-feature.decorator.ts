import { SetMetadata } from '@nestjs/common';
import { AccessLevel, ManagedFeatureKey } from './feature-keys';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

export type RequireFeatureMeta = {
  featureKey: ManagedFeatureKey;
  level: AccessLevel;
  /** Extra managed features that also satisfy this check (OR). */
  orFeatureKeys?: ManagedFeatureKey[];
};

export const RequireFeature = (
  featureKey: ManagedFeatureKey,
  level: AccessLevel,
  options?: { orFeatureKeys?: ManagedFeatureKey[] },
) =>
  SetMetadata(REQUIRE_FEATURE_KEY, {
    featureKey,
    level,
    orFeatureKeys: options?.orFeatureKeys,
  } satisfies RequireFeatureMeta);
