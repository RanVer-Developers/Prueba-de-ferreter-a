import {
  resolveAuthRbacFeatures,
  type AuthRbacFeatureFlags,
  type AuthRbacFeatureProfile,
} from '@modulos/core-auth-rbac';
import {
  resolveCashierFeatures,
  type CashierFeatureFlags,
  type CashierFeatureProfile,
} from '@modulos/core-cashier';
import {
  resolveCatalogFeatures,
  type CatalogFeatureFlags,
  type CatalogFeatureProfile,
} from '@modulos/core-catalog';
import {
  resolveCustomerFeatures,
  type CustomerFeatureFlags,
  type CustomerFeatureProfile,
} from '@modulos/core-customers';
import {
  resolveInventoryFeatures,
  type InventoryFeatureFlags,
  type InventoryFeatureProfile,
} from '@modulos/core-inventory';
import {
  resolveLogisticsFeatures,
  type LogisticsFeatureFlags,
  type LogisticsFeatureProfile,
} from '@modulos/core-logistics';
import {
  resolveOrderFeatures,
  type OrderFeatureFlags,
  type OrderFeatureProfile,
} from '@modulos/core-orders';
import {
  resolvePurchasingFeatures,
  type PurchasingFeatureFlags,
  type PurchasingFeatureProfile,
} from '@modulos/core-purchasing';
import {
  resolveReportFeatureFlags,
  type ReportFeatureFlags,
  type ReportFeatureProfileInput,
} from '@modulos/core-reports';
import {
  resolveServicesFeatures,
  type ServicesFeatureFlags,
  type ServicesFeatureProfile,
} from '@modulos/core-services';
import {
  resolveSettingsFeatures,
  type SettingsFeatureFlags,
  type SettingsFeatureProfile,
} from '@modulos/core-settings';

export interface FerreAguilarFeatureProfiles {
  settings: SettingsFeatureProfile;
  authRbac: AuthRbacFeatureProfile;
  catalog: CatalogFeatureProfile;
  customers: CustomerFeatureProfile;
  inventory: InventoryFeatureProfile;
  purchasing: PurchasingFeatureProfile;
  orders: OrderFeatureProfile;
  cashier: CashierFeatureProfile;
  logistics: LogisticsFeatureProfile;
  services: ServicesFeatureProfile;
  reports: ReportFeatureProfileInput;
}

export interface FerreAguilarResolvedFeatures {
  settings: SettingsFeatureFlags;
  authRbac: AuthRbacFeatureFlags;
  catalog: CatalogFeatureFlags;
  customers: CustomerFeatureFlags;
  inventory: InventoryFeatureFlags;
  purchasing: PurchasingFeatureFlags;
  orders: OrderFeatureFlags;
  cashier: CashierFeatureFlags;
  logistics: LogisticsFeatureFlags;
  services: ServicesFeatureFlags;
  reports: ReportFeatureFlags;
}

export const FERRE_AGUILAR_FEATURE_PROFILES: Readonly<FerreAguilarFeatureProfiles> = {
  settings: {
    multiCompany: false,
    multiBranch: false,
    fiscalPeriods: false,
    softLockPeriods: false,
    terminalScopedSettings: false,
    auditTrail: true,
  },
  authRbac: 'INTERMEDIATE',
  catalog: {
    categories: true,
    variants: false,
    modifiersAndAddons: false,
    bundlesAndKits: false,
    multiChannelVisibility: false,
    priceLists: true,
    volumeTierPricing: false,
    promotions: false,
    multiBarcodeLookup: true,
    taxProfileHints: true,
    optimisticConcurrency: true,
    auditTrail: true,
  },
  customers: {
    ...resolveCustomerFeatures('INTERMEDIATE'),
    creditAccounts: true,
    creditAgingAndHolds: true,
    prepaidWallet: false,
    loyaltyPoints: false,
  },
  inventory: {
    multiWarehouse: false,
    negativeStock: false,
    batchLots: false,
    fefoRotation: false,
    serialNumbers: false,
    fifoValuation: false,
    reservations: true,
    stockTransfers: false,
    blindCounts: false,
    receivingOrders: true,
    bomCombos: false,
    breakPack: false,
    binLocations: false,
    abcClassification: true,
    barcodeLabels: true,
    replenishmentSuggestions: true,
    autoExpireLots: false,
    cycleCounting: false,
  },
  purchasing: 'INTERMEDIATE',
  orders: {
    ...resolveOrderFeatures('INTERMEDIATE'),
    fractionalQuantities: true,
    multipleTaxesPerLine: false,
  },
  cashier: {
    ...resolveCashierFeatures('INTERMEDIATE'),
    tips: false,
    tipPayouts: false,
    openDrawerNoSale: true,
    supervisorSignatures: true,
  },
  logistics: 'INTERMEDIATE',
  services: {
    ...resolveServicesFeatures('INTERMEDIATE'),
    billingIntegration: false,
  },
  reports: {
    ...resolveReportFeatureFlags('INTERMEDIATE'),
    abcParetoAnalytics: true,
  },
};

export function resolveFerreAguilarFeatures(
  overrides: Partial<FerreAguilarFeatureProfiles> = {}
): FerreAguilarResolvedFeatures {
  return {
    settings: resolveSettingsFeatures(overrides.settings ?? FERRE_AGUILAR_FEATURE_PROFILES.settings),
    authRbac: resolveAuthRbacFeatures(overrides.authRbac ?? FERRE_AGUILAR_FEATURE_PROFILES.authRbac),
    catalog: resolveCatalogFeatures(overrides.catalog ?? FERRE_AGUILAR_FEATURE_PROFILES.catalog),
    customers: resolveCustomerFeatures(
      overrides.customers ?? FERRE_AGUILAR_FEATURE_PROFILES.customers
    ),
    inventory: resolveInventoryFeatures(
      overrides.inventory ?? FERRE_AGUILAR_FEATURE_PROFILES.inventory
    ),
    purchasing: resolvePurchasingFeatures(
      overrides.purchasing ?? FERRE_AGUILAR_FEATURE_PROFILES.purchasing
    ),
    orders: resolveOrderFeatures(overrides.orders ?? FERRE_AGUILAR_FEATURE_PROFILES.orders),
    cashier: resolveCashierFeatures(overrides.cashier ?? FERRE_AGUILAR_FEATURE_PROFILES.cashier),
    logistics: resolveLogisticsFeatures(
      overrides.logistics ?? FERRE_AGUILAR_FEATURE_PROFILES.logistics
    ),
    services: resolveServicesFeatures(overrides.services ?? FERRE_AGUILAR_FEATURE_PROFILES.services),
    reports: resolveReportFeatureFlags(overrides.reports ?? FERRE_AGUILAR_FEATURE_PROFILES.reports),
  };
}
