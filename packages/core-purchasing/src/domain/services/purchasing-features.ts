import { PurchasingFeatureDisabledError } from '../errors/purchasing-errors.js';

/**
 * Complexity tiers to adapt @modulos/core-purchasing from simple store restocking
 * to full procurement with PO approvals, cost strategies, and accounts payable.
 */
export type PurchasingTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type CostUpdateStrategy = 'LAST_COST' | 'WEIGHTED_AVERAGE' | 'NONE';

export type PurchasingFeature =
  | 'directPurchaseWithoutPO'
  | 'requirePOApproval'
  | 'allowOverReceiving'
  | 'autoUpdateCatalogCost'
  | 'accountsPayable'
  | 'enforceCreditLimit'
  | 'fractionalQuantities'
  | 'auditTrail';

export type PurchasingFeatureFlags = Record<PurchasingFeature, boolean>;

export type PurchasingFeatureProfile = PurchasingTier | Partial<PurchasingFeatureFlags>;

export const PURCHASING_TIER_PRESETS: Readonly<
  Record<PurchasingTier, Readonly<PurchasingFeatureFlags>>
> = {
  BASIC: {
    directPurchaseWithoutPO: true,
    requirePOApproval: false,
    allowOverReceiving: true,
    autoUpdateCatalogCost: true,
    accountsPayable: false,
    enforceCreditLimit: false,
    fractionalQuantities: false,
    auditTrail: false,
  },
  INTERMEDIATE: {
    directPurchaseWithoutPO: true,
    requirePOApproval: false,
    allowOverReceiving: false,
    autoUpdateCatalogCost: true,
    accountsPayable: true,
    enforceCreditLimit: false,
    fractionalQuantities: true,
    auditTrail: true,
  },
  ADVANCED: {
    directPurchaseWithoutPO: false,
    requirePOApproval: true,
    allowOverReceiving: false,
    autoUpdateCatalogCost: true,
    accountsPayable: true,
    enforceCreditLimit: true,
    fractionalQuantities: true,
    auditTrail: true,
  },
};

export function resolvePurchasingFeatures(
  profile: PurchasingFeatureProfile = 'INTERMEDIATE',
): PurchasingFeatureFlags {
  if (typeof profile === 'string') {
    return { ...PURCHASING_TIER_PRESETS[profile] };
  }
  return {
    ...PURCHASING_TIER_PRESETS.INTERMEDIATE,
    ...profile,
  };
}

export function assertPurchasingFeatureEnabled(
  features: Readonly<PurchasingFeatureFlags>,
  feature: PurchasingFeature,
): void {
  if (!features[feature]) {
    throw new PurchasingFeatureDisabledError(feature);
  }
}
