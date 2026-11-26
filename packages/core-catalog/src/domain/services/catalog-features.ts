import { FeatureDisabledError } from '../errors/catalog-errors.js';

export type CatalogTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type CatalogFeature =
  | 'categories'
  | 'variants'
  | 'modifiersAndAddons'
  | 'bundlesAndKits'
  | 'multiChannelVisibility'
  | 'priceLists'
  | 'volumeTierPricing'
  | 'promotions'
  | 'multiBarcodeLookup'
  | 'taxProfileHints'
  | 'optimisticConcurrency'
  | 'auditTrail';

export type CatalogFeatureFlags = Record<CatalogFeature, boolean>;
export type CatalogFeatureProfile = CatalogTier | Partial<CatalogFeatureFlags>;

export const CATALOG_TIER_PRESETS: Readonly<Record<CatalogTier, Readonly<CatalogFeatureFlags>>> = {
  BASIC: {
    categories: true,
    variants: false,
    modifiersAndAddons: false,
    bundlesAndKits: false,
    multiChannelVisibility: false,
    priceLists: false,
    volumeTierPricing: false,
    promotions: false,
    multiBarcodeLookup: false,
    taxProfileHints: true,
    optimisticConcurrency: true,
    auditTrail: false,
  },
  INTERMEDIATE: {
    categories: true,
    variants: true,
    modifiersAndAddons: true,
    bundlesAndKits: true,
    multiChannelVisibility: true,
    priceLists: true,
    volumeTierPricing: false,
    promotions: true,
    multiBarcodeLookup: true,
    taxProfileHints: true,
    optimisticConcurrency: true,
    auditTrail: true,
  },
  ADVANCED: {
    categories: true,
    variants: true,
    modifiersAndAddons: true,
    bundlesAndKits: true,
    multiChannelVisibility: true,
    priceLists: true,
    volumeTierPricing: true,
    promotions: true,
    multiBarcodeLookup: true,
    taxProfileHints: true,
    optimisticConcurrency: true,
    auditTrail: true,
  },
};

export function resolveCatalogFeatures(
  profile?: CatalogFeatureProfile,
  baseTier: CatalogTier = 'ADVANCED'
): CatalogFeatureFlags {
  if (!profile) {
    return { ...CATALOG_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...CATALOG_TIER_PRESETS[profile] };
  }
  return {
    ...CATALOG_TIER_PRESETS[baseTier],
    ...profile,
  };
}

export function createCatalogFeatureFlags(
  baseTier: CatalogTier,
  overrides: Partial<CatalogFeatureFlags> = {}
): CatalogFeatureFlags {
  return {
    ...CATALOG_TIER_PRESETS[baseTier],
    ...overrides,
  };
}

export function isCatalogFeatureEnabled(
  flags: CatalogFeatureFlags | undefined,
  feature: CatalogFeature
): boolean {
  if (!flags) return true;
  return flags[feature] === true;
}

export function assertCatalogFeatureEnabled(
  flags: CatalogFeatureFlags | undefined,
  feature: CatalogFeature,
  details?: string
): void {
  if (!isCatalogFeatureEnabled(flags, feature)) {
    throw new FeatureDisabledError(feature, details);
  }
}
