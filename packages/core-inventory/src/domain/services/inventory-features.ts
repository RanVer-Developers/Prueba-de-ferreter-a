import { FeatureDisabledError } from '../errors/inventory-errors.js';

/**
 * Niveles de complejidad predefinidos para adaptar el módulo de inventario
 * a comercios pequeños (BASIC), medianos (INTERMEDIATE) o empresariales/WMS (ADVANCED).
 */
export type InventoryTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Capacidades individuales del dominio de inventario que pueden habilitarse o deshabilitarse
 * mediante un perfil (`InventoryTier`) o banderas granulares (`InventoryFeatureFlags`).
 */
export type InventoryFeature =
  | 'multiWarehouse'
  | 'negativeStock'
  | 'batchLots'
  | 'fefoRotation'
  | 'serialNumbers'
  | 'fifoValuation'
  | 'reservations'
  | 'stockTransfers'
  | 'blindCounts'
  | 'receivingOrders'
  | 'bomCombos'
  | 'breakPack'
  | 'binLocations'
  | 'abcClassification'
  | 'barcodeLabels'
  | 'replenishmentSuggestions'
  | 'autoExpireLots'
  | 'cycleCounting';

export type InventoryFeatureFlags = Record<InventoryFeature, boolean>;

export type InventoryFeatureProfile = InventoryTier | Partial<InventoryFeatureFlags>;

export const INVENTORY_TIER_PRESETS: Readonly<Record<InventoryTier, Readonly<InventoryFeatureFlags>>> = {
  BASIC: {
    multiWarehouse: false,
    negativeStock: false,
    batchLots: false,
    fefoRotation: false,
    serialNumbers: false,
    fifoValuation: false,
    reservations: false,
    stockTransfers: false,
    blindCounts: false,
    receivingOrders: false,
    bomCombos: false,
    breakPack: false,
    binLocations: false,
    abcClassification: false,
    barcodeLabels: true,
    replenishmentSuggestions: false,
    autoExpireLots: false,
    cycleCounting: false,
  },
  INTERMEDIATE: {
    multiWarehouse: true,
    negativeStock: false,
    batchLots: true,
    fefoRotation: true,
    serialNumbers: false,
    fifoValuation: false,
    reservations: true,
    stockTransfers: true,
    blindCounts: false,
    receivingOrders: true,
    bomCombos: true,
    breakPack: true,
    binLocations: false,
    abcClassification: true,
    barcodeLabels: true,
    replenishmentSuggestions: true,
    autoExpireLots: true,
    cycleCounting: false,
  },
  ADVANCED: {
    multiWarehouse: true,
    negativeStock: false,
    batchLots: true,
    fefoRotation: true,
    serialNumbers: true,
    fifoValuation: true,
    reservations: true,
    stockTransfers: true,
    blindCounts: true,
    receivingOrders: true,
    bomCombos: true,
    breakPack: true,
    binLocations: true,
    abcClassification: true,
    barcodeLabels: true,
    replenishmentSuggestions: true,
    autoExpireLots: true,
    cycleCounting: true,
  },
};

/**
 * Resuelve un perfil (`InventoryTier` o mapa parcial de flags) a un conjunto completo de `InventoryFeatureFlags`.
 * Si no se especifica perfil, todas las funcionalidades principales permanecen habilitadas (`ADVANCED`)
 * para preservar compatibilidad total hacia atrás.
 */
export function resolveInventoryFeatures(
  profile?: InventoryFeatureProfile,
  baseTier: InventoryTier = 'ADVANCED'
): InventoryFeatureFlags {
  if (!profile) {
    return { ...INVENTORY_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...INVENTORY_TIER_PRESETS[profile] };
  }
  return {
    ...INVENTORY_TIER_PRESETS[baseTier],
    ...profile,
  };
}

export function createInventoryFeatureFlags(
  baseTier: InventoryTier,
  overrides: Partial<InventoryFeatureFlags> = {}
): InventoryFeatureFlags {
  return {
    ...INVENTORY_TIER_PRESETS[baseTier],
    ...overrides,
  };
}

export function isInventoryFeatureEnabled(
  flags: InventoryFeatureFlags | undefined,
  feature: InventoryFeature
): boolean {
  if (!flags) return true;
  return flags[feature] === true;
}

export function assertInventoryFeatureEnabled(
  flags: InventoryFeatureFlags | undefined,
  feature: InventoryFeature,
  details?: string
): void {
  if (!isInventoryFeatureEnabled(flags, feature)) {
    throw new FeatureDisabledError(feature, details);
  }
}
