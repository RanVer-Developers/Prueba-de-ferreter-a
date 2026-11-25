import { FeatureDisabledError } from '../errors/customer-errors.js';

/**
 * Complexity tiers to adapt @modulos/core-customers across simple POS directories,
 * mid-market retail with store credit/loyalty, and B2B/enterprise accounts receivable.
 */
export type CustomerTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type CustomerFeature =
  | 'customerTypes'
  | 'multipleAddresses'
  | 'segmentsAndTags'
  | 'creditAccounts'
  | 'creditAgingAndHolds'
  | 'prepaidWallet'
  | 'loyaltyPoints'
  | 'loyaltyTiers'
  | 'loyaltyExpiration'
  | 'gdprAnonymization'
  | 'offlineIdempotency'
  | 'optimisticConcurrency'
  | 'auditTrail';

export type CustomerFeatureFlags = Record<CustomerFeature, boolean>;

export type CustomerFeatureProfile = CustomerTier | Partial<CustomerFeatureFlags>;

export const CUSTOMER_TIER_PRESETS: Readonly<Record<CustomerTier, Readonly<CustomerFeatureFlags>>> = {
  BASIC: {
    customerTypes: false,
    multipleAddresses: false,
    segmentsAndTags: false,
    creditAccounts: false,
    creditAgingAndHolds: false,
    prepaidWallet: false,
    loyaltyPoints: false,
    loyaltyTiers: false,
    loyaltyExpiration: false,
    gdprAnonymization: false,
    offlineIdempotency: true,
    optimisticConcurrency: true,
    auditTrail: false,
  },
  INTERMEDIATE: {
    customerTypes: true,
    multipleAddresses: true,
    segmentsAndTags: true,
    creditAccounts: true,
    creditAgingAndHolds: false,
    prepaidWallet: true,
    loyaltyPoints: true,
    loyaltyTiers: false,
    loyaltyExpiration: false,
    gdprAnonymization: true,
    offlineIdempotency: true,
    optimisticConcurrency: true,
    auditTrail: true,
  },
  ADVANCED: {
    customerTypes: true,
    multipleAddresses: true,
    segmentsAndTags: true,
    creditAccounts: true,
    creditAgingAndHolds: true,
    prepaidWallet: true,
    loyaltyPoints: true,
    loyaltyTiers: true,
    loyaltyExpiration: true,
    gdprAnonymization: true,
    offlineIdempotency: true,
    optimisticConcurrency: true,
    auditTrail: true,
  },
};

export function resolveCustomerFeatures(
  profile?: CustomerFeatureProfile,
  baseTier: CustomerTier = 'ADVANCED'
): CustomerFeatureFlags {
  if (!profile) {
    return { ...CUSTOMER_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...CUSTOMER_TIER_PRESETS[profile] };
  }
  return {
    ...CUSTOMER_TIER_PRESETS[baseTier],
    ...profile,
  };
}

export function createCustomerFeatureFlags(
  baseTier: CustomerTier,
  overrides: Partial<CustomerFeatureFlags> = {}
): CustomerFeatureFlags {
  return {
    ...CUSTOMER_TIER_PRESETS[baseTier],
    ...overrides,
  };
}

export function isCustomerFeatureEnabled(
  flags: CustomerFeatureFlags | undefined,
  feature: CustomerFeature
): boolean {
  if (!flags) return true;
  return flags[feature] === true;
}

export function assertCustomerFeatureEnabled(
  flags: CustomerFeatureFlags | undefined,
  feature: CustomerFeature,
  details?: string
): void {
  if (!isCustomerFeatureEnabled(flags, feature)) {
    throw new FeatureDisabledError(feature, details);
  }
}
