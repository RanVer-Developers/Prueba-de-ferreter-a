import { FeatureDisabledError } from '../errors/order-errors.js';

/**
 * Complexity tiers to adapt @modulos/core-orders across simple POS, mid-market retail,
 * and enterprise omnichannel / e-commerce flows.
 */
export type OrderTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Granular capabilities of the orders domain controlled via `OrderTier` or `OrderFeatureFlags`.
 */
export type OrderFeature =
  | 'lineDiscounts'
  | 'orderDiscounts'
  | 'coupons'
  | 'inclusiveTaxes'
  | 'multipleTaxesPerLine'
  | 'workflowStates'
  | 'fractionalQuantities'
  | 'refunds'
  | 'offlineIdempotency'
  | 'optimisticConcurrency'
  | 'auditTrail'
  | 'parkedOrders'
  | 'fulfillmentDetails'
  | 'surchargesAndFees'
  | 'orderSplitting'
  | 'quotes'
  | 'deliveryNotes'
  | 'documentConsolidation'
  | 'documentImport';

export type OrderFeatureFlags = Record<OrderFeature, boolean>;

export type OrderFeatureProfile = OrderTier | Partial<OrderFeatureFlags>;

export const ORDER_TIER_PRESETS: Readonly<Record<OrderTier, Readonly<OrderFeatureFlags>>> = {
  BASIC: {
    lineDiscounts: false,
    orderDiscounts: false,
    coupons: false,
    inclusiveTaxes: true,
    multipleTaxesPerLine: false,
    workflowStates: false,
    fractionalQuantities: false,
    refunds: false,
    offlineIdempotency: true,
    optimisticConcurrency: true,
    auditTrail: false,
    parkedOrders: true,
    fulfillmentDetails: false,
    surchargesAndFees: false,
    orderSplitting: false,
    quotes: false,
    deliveryNotes: false,
    documentConsolidation: false,
    documentImport: false,
  },
  INTERMEDIATE: {
    lineDiscounts: true,
    orderDiscounts: true,
    coupons: false,
    inclusiveTaxes: true,
    multipleTaxesPerLine: true,
    workflowStates: true,
    fractionalQuantities: false,
    refunds: true,
    offlineIdempotency: true,
    optimisticConcurrency: true,
    auditTrail: true,
    parkedOrders: true,
    fulfillmentDetails: true,
    surchargesAndFees: true,
    orderSplitting: false,
    quotes: true,
    deliveryNotes: true,
    documentConsolidation: true,
    documentImport: false,
  },
  ADVANCED: {
    lineDiscounts: true,
    orderDiscounts: true,
    coupons: true,
    inclusiveTaxes: true,
    multipleTaxesPerLine: true,
    workflowStates: true,
    fractionalQuantities: true,
    refunds: true,
    offlineIdempotency: true,
    optimisticConcurrency: true,
    auditTrail: true,
    parkedOrders: true,
    fulfillmentDetails: true,
    surchargesAndFees: true,
    orderSplitting: true,
    quotes: true,
    deliveryNotes: true,
    documentConsolidation: true,
    documentImport: true,
  },
};

/**
 * Resolves a tier name or partial flag overrides into a complete `OrderFeatureFlags` map.
 * Defaults to `ADVANCED` when omitted so all capabilities are available unless restricted.
 */
export function resolveOrderFeatures(
  profile?: OrderFeatureProfile,
  baseTier: OrderTier = 'ADVANCED'
): OrderFeatureFlags {
  if (!profile) {
    return { ...ORDER_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...ORDER_TIER_PRESETS[profile] };
  }
  return {
    ...ORDER_TIER_PRESETS[baseTier],
    ...profile,
  };
}

export function createOrderFeatureFlags(
  baseTier: OrderTier,
  overrides: Partial<OrderFeatureFlags> = {}
): OrderFeatureFlags {
  return {
    ...ORDER_TIER_PRESETS[baseTier],
    ...overrides,
  };
}

export function isOrderFeatureEnabled(
  flags: OrderFeatureFlags | undefined,
  feature: OrderFeature
): boolean {
  if (!flags) return true;
  return flags[feature] === true;
}

export function assertOrderFeatureEnabled(
  flags: OrderFeatureFlags | undefined,
  feature: OrderFeature,
  details?: string
): void {
  if (!isOrderFeatureEnabled(flags, feature)) {
    throw new FeatureDisabledError(feature, details);
  }
}
