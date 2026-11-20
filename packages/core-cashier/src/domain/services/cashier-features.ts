import { FeatureDisabledError } from '../errors/cashier-errors.js';

/**
 * Niveles de complejidad predefinidos para adaptar el módulo de caja
 * a comercios pequeños (BASIC), medianos (INTERMEDIATE) o empresariales (ADVANCED).
 */
export type CashierTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Capacidades individuales del dominio de caja que pueden habilitarse o deshabilitarse
 * mediante un perfil (`CashierTier`) o banderas granulares (`CashierFeatureFlags`).
 */
export type CashierFeature =
  | 'splitPayments'
  | 'cashDenominationTracking'
  | 'optimalCoinChange'
  | 'denominationExchange'
  | 'cashRounding'
  | 'tips'
  | 'tipPayouts'
  | 'categorizedExpenses'
  | 'safeDrops'
  | 'linkedRefunds'
  | 'voidTransactions'
  | 'blindCounts'
  | 'supervisorSignatures'
  | 'handovers'
  | 'openDrawerNoSale'
  | 'multiCurrencyTendered'
  | 'consolidatedReports'
  | 'escPosPrinting';

export type CashierFeatureFlags = Record<CashierFeature, boolean>;

export type CashierFeatureProfile = CashierTier | Partial<CashierFeatureFlags>;

export const CASHIER_TIER_PRESETS: Readonly<Record<CashierTier, Readonly<CashierFeatureFlags>>> = {
  BASIC: {
    splitPayments: false,
    cashDenominationTracking: false,
    optimalCoinChange: false,
    denominationExchange: false,
    cashRounding: false,
    tips: false,
    tipPayouts: false,
    categorizedExpenses: false,
    safeDrops: false,
    linkedRefunds: false,
    voidTransactions: false,
    blindCounts: false,
    supervisorSignatures: false,
    handovers: false,
    openDrawerNoSale: false,
    multiCurrencyTendered: false,
    consolidatedReports: false,
    escPosPrinting: true,
  },
  INTERMEDIATE: {
    splitPayments: true,
    cashDenominationTracking: true,
    optimalCoinChange: false,
    denominationExchange: true,
    cashRounding: true,
    tips: true,
    tipPayouts: true,
    categorizedExpenses: true,
    safeDrops: true,
    linkedRefunds: true,
    voidTransactions: true,
    blindCounts: false,
    supervisorSignatures: false,
    handovers: false,
    openDrawerNoSale: false,
    multiCurrencyTendered: false,
    consolidatedReports: false,
    escPosPrinting: true,
  },
  ADVANCED: {
    splitPayments: true,
    cashDenominationTracking: true,
    optimalCoinChange: true,
    denominationExchange: true,
    cashRounding: true,
    tips: true,
    tipPayouts: true,
    categorizedExpenses: true,
    safeDrops: true,
    linkedRefunds: true,
    voidTransactions: true,
    blindCounts: true,
    supervisorSignatures: true,
    handovers: true,
    openDrawerNoSale: true,
    multiCurrencyTendered: true,
    consolidatedReports: true,
    escPosPrinting: true,
  },
};

/**
 * Resuelve un perfil (`CashierTier` o mapa parcial de flags) a un conjunto completo de `CashierFeatureFlags`.
 * Si no se especifica perfil, todas las funcionalidades permanecen habilitadas (`ADVANCED`) para preservar
 * compatibilidad total hacia atrás.
 */
export function resolveCashierFeatures(
  profile?: CashierFeatureProfile,
  baseTier: CashierTier = 'ADVANCED'
): CashierFeatureFlags {
  if (!profile) {
    return { ...CASHIER_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...CASHIER_TIER_PRESETS[profile] };
  }
  return {
    ...CASHIER_TIER_PRESETS[baseTier],
    ...profile,
  };
}

/**
 * Crea un perfil personalizado partiendo de un tier base (`BASIC`, `INTERMEDIATE`, `ADVANCED`)
 * y sobreescribiendo flags específicos.
 */
export function createCashierFeatureFlags(
  baseTier: CashierTier,
  overrides: Partial<CashierFeatureFlags> = {}
): CashierFeatureFlags {
  return {
    ...CASHIER_TIER_PRESETS[baseTier],
    ...overrides,
  };
}

export function isFeatureEnabled(
  flags: CashierFeatureFlags | undefined,
  feature: CashierFeature
): boolean {
  if (!flags) return true;
  return flags[feature] === true;
}

export function assertFeatureEnabled(
  flags: CashierFeatureFlags | undefined,
  feature: CashierFeature,
  details?: string
): void {
  if (!isFeatureEnabled(flags, feature)) {
    throw new FeatureDisabledError(feature, details);
  }
}
