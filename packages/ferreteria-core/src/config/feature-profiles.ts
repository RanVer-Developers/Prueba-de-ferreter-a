import { z } from 'zod';
import {
  AUTH_RBAC_TIER_PRESETS,
  type AuthRbacFeatureProfile,
} from '@modulos/core-auth-rbac';
import {
  CASHIER_TIER_PRESETS,
  type CashierFeatureProfile,
} from '@modulos/core-cashier';
import {
  CATALOG_TIER_PRESETS,
  type CatalogFeatureProfile,
} from '@modulos/core-catalog';
import {
  CUSTOMER_TIER_PRESETS,
  type CustomerFeatureProfile,
} from '@modulos/core-customers';
import {
  INVENTORY_TIER_PRESETS,
  type InventoryFeatureProfile,
} from '@modulos/core-inventory';
import {
  LOGISTICS_TIER_PRESETS,
  type LogisticsFeatureProfile,
} from '@modulos/core-logistics';
import {
  ORDER_TIER_PRESETS,
  type OrderFeatureProfile,
} from '@modulos/core-orders';
import {
  PURCHASING_TIER_PRESETS,
  type PurchasingFeatureProfile,
} from '@modulos/core-purchasing';
import {
  REPORT_TIER_PRESETS,
  type ReportFeatureProfileInput,
} from '@modulos/core-reports';
import {
  SETTINGS_TIER_PRESETS,
  type SettingsFeatureProfile,
} from '@modulos/core-settings';

export const OwnerControlsConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  blockZeroStockWithoutOwnerPin: z.boolean().default(true),
  blockExceededCreditWithoutOwnerPin: z.boolean().default(true),
  blindCashCountOnClose: z.boolean().default(true),
  sellerMaxDiscountPercent: z.number().min(0).max(100).default(5),
  allowQuoteReservation: z.boolean().default(true),
  requireReasonOnCashExpense: z.boolean().default(true),
  costIncreaseAlertThresholdPercent: z.number().min(0).max(100).default(0),
});

export type OwnerControlsConfig = z.infer<typeof OwnerControlsConfigSchema>;

export interface FerreteriaFeatureProfiles {
  settings: SettingsFeatureProfile;
  authRbac: AuthRbacFeatureProfile;
  catalog: CatalogFeatureProfile;
  customers: CustomerFeatureProfile;
  orders: OrderFeatureProfile;
  cashier: CashierFeatureProfile;
  inventory: InventoryFeatureProfile;
  purchasing: PurchasingFeatureProfile;
  reports: ReportFeatureProfileInput;
  logistics: LogisticsFeatureProfile;
}

export function buildFerreteriaFeatureProfiles(
  controls: Partial<OwnerControlsConfig> = {}
): {
  controls: OwnerControlsConfig;
  profiles: FerreteriaFeatureProfiles;
} {
  const resolvedControls = OwnerControlsConfigSchema.parse(controls);

  const profiles: FerreteriaFeatureProfiles = {
    settings: { ...SETTINGS_TIER_PRESETS.BASIC },
    authRbac: { ...AUTH_RBAC_TIER_PRESETS.INTERMEDIATE },
    catalog: {
      ...CATALOG_TIER_PRESETS.INTERMEDIATE,
      volumeTierPricing: true,
    },
    customers: { ...CUSTOMER_TIER_PRESETS.ADVANCED },
    orders: { ...ORDER_TIER_PRESETS.ADVANCED },
    cashier: {
      ...CASHIER_TIER_PRESETS.ADVANCED,
      blindCounts: resolvedControls.blindCashCountOnClose,
    },
    inventory: {
      ...INVENTORY_TIER_PRESETS.INTERMEDIATE,
      binLocations: true,
      cycleCounting: true,
      negativeStock: !resolvedControls.blockZeroStockWithoutOwnerPin,
    },
    purchasing: {
      ...PURCHASING_TIER_PRESETS.BASIC,
      auditTrail: true,
    },
    reports: { ...REPORT_TIER_PRESETS.INTERMEDIATE },
    logistics: { ...LOGISTICS_TIER_PRESETS.BASIC },
  };

  return { controls: resolvedControls, profiles };
}
