import { ServiceFeatureDisabledError } from '../errors/services-errors.js';

export type ServicesTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type ServicesFeature =
  | 'requireDiagnosisApproval'
  | 'technicianAssignment'
  | 'partsConsumption'
  | 'warrantyTracking'
  | 'qualityCheckGate'
  | 'billingIntegration';

export type ServicesFeatureFlags = Record<ServicesFeature, boolean>;
export type ServicesFeatureProfile = ServicesTier | Partial<ServicesFeatureFlags>;

export const SERVICES_TIER_PRESETS: Readonly<Record<ServicesTier, Readonly<ServicesFeatureFlags>>> = {
  BASIC: {
    requireDiagnosisApproval: false,
    technicianAssignment: false,
    partsConsumption: true,
    warrantyTracking: false,
    qualityCheckGate: false,
    billingIntegration: false,
  },
  INTERMEDIATE: {
    requireDiagnosisApproval: true,
    technicianAssignment: true,
    partsConsumption: true,
    warrantyTracking: true,
    qualityCheckGate: false,
    billingIntegration: true,
  },
  ADVANCED: {
    requireDiagnosisApproval: true,
    technicianAssignment: true,
    partsConsumption: true,
    warrantyTracking: true,
    qualityCheckGate: true,
    billingIntegration: true,
  },
};

export function resolveServicesFeatures(
  profile: ServicesFeatureProfile = 'INTERMEDIATE',
): ServicesFeatureFlags {
  if (typeof profile === 'string') {
    return { ...SERVICES_TIER_PRESETS[profile] };
  }
  return { ...SERVICES_TIER_PRESETS.INTERMEDIATE, ...profile };
}

export function assertServiceFeatureEnabled(
  features: Readonly<ServicesFeatureFlags>,
  feature: ServicesFeature,
): void {
  if (!features[feature]) {
    throw new ServiceFeatureDisabledError(feature);
  }
}
