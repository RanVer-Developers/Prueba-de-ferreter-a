import { FeatureDisabledError } from '../errors/logistics-errors.js';
import {
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  type LogisticsFeatureFlags,
} from '../../schemas/logistics-schemas.js';

export type LogisticsTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type LogisticsFeatureProfile = LogisticsTier | Partial<LogisticsFeatureFlags>;

export const LOGISTICS_TIER_PRESETS: Readonly<
  Record<LogisticsTier, Readonly<LogisticsFeatureFlags>>
> = {
  BASIC: {
    enableZoneRates: true,
    enableDistanceRates: false,
    enableWeightRates: false,
    enableFreeShippingThreshold: true,
    requireProofOfDelivery: false,
    requireDeliveryPin: false,
    maxDeliveryAttempts: 3,
    allowReturnFromFailed: true,
    enforceDriverCapacity: false,
  },
  INTERMEDIATE: {
    ...DEFAULT_LOGISTICS_FEATURE_FLAGS,
    requireProofOfDelivery: true,
    requireDeliveryPin: false,
    enforceDriverCapacity: true,
  },
  ADVANCED: {
    enableZoneRates: true,
    enableDistanceRates: true,
    enableWeightRates: true,
    enableFreeShippingThreshold: true,
    requireProofOfDelivery: true,
    requireDeliveryPin: true,
    maxDeliveryAttempts: 5,
    allowReturnFromFailed: true,
    enforceDriverCapacity: true,
  },
};

export function resolveLogisticsFeatures(
  profile: LogisticsFeatureProfile = 'INTERMEDIATE',
): LogisticsFeatureFlags {
  if (typeof profile === 'string') {
    return { ...LOGISTICS_TIER_PRESETS[profile] };
  }
  return {
    ...DEFAULT_LOGISTICS_FEATURE_FLAGS,
    ...profile,
  };
}

export type LogisticsBooleanFeature = {
  [K in keyof LogisticsFeatureFlags]: LogisticsFeatureFlags[K] extends boolean ? K : never;
}[keyof LogisticsFeatureFlags];

/**
 * Pure boolean feature flags (`Record<LogisticsBooleanFeature, boolean>`),
 * separated from numeric policy configuration (`maxDeliveryAttempts`).
 */
export type LogisticsBooleanFeatureFlags = Record<LogisticsBooleanFeature, boolean>;

/**
 * Non-boolean policy thresholds stored alongside `LogisticsFeatureFlags` for backward compatibility.
 */
export interface LogisticsPolicyConfig {
  maxDeliveryAttempts: number;
}

export function splitLogisticsFeatures(flags: Readonly<LogisticsFeatureFlags>): {
  features: LogisticsBooleanFeatureFlags;
  policy: LogisticsPolicyConfig;
} {
  return {
    features: {
      enableZoneRates: flags.enableZoneRates,
      enableDistanceRates: flags.enableDistanceRates,
      enableWeightRates: flags.enableWeightRates,
      enableFreeShippingThreshold: flags.enableFreeShippingThreshold,
      requireProofOfDelivery: flags.requireProofOfDelivery,
      requireDeliveryPin: flags.requireDeliveryPin,
      allowReturnFromFailed: flags.allowReturnFromFailed,
      enforceDriverCapacity: flags.enforceDriverCapacity,
    },
    policy: {
      maxDeliveryAttempts: flags.maxDeliveryAttempts,
    },
  };
}

export function composeLogisticsFeatures(
  features: Partial<LogisticsBooleanFeatureFlags> = {},
  policy: Partial<LogisticsPolicyConfig> = {},
  baseTier: LogisticsTier = 'INTERMEDIATE'
): LogisticsFeatureFlags {
  return {
    ...LOGISTICS_TIER_PRESETS[baseTier],
    ...features,
    ...policy,
  };
}

export function assertLogisticsFeatureEnabled(
  features: Readonly<LogisticsBooleanFeatureFlags>,
  feature: LogisticsBooleanFeature,
): void {
  if (!features[feature]) {
    throw new FeatureDisabledError(feature);
  }
}
