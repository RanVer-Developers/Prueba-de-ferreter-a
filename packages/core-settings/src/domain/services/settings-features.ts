import { SettingsFeatureDisabledError } from '../errors/settings-errors.js';

export type SettingsTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type SettingsFeature =
  | 'multiCompany'
  | 'multiBranch'
  | 'fiscalPeriods'
  | 'softLockPeriods'
  | 'terminalScopedSettings'
  | 'auditTrail';

export type SettingsFeatureFlags = Record<SettingsFeature, boolean>;
export type SettingsFeatureProfile = SettingsTier | Partial<SettingsFeatureFlags>;

export const SETTINGS_TIER_PRESETS: Readonly<
  Record<SettingsTier, Readonly<SettingsFeatureFlags>>
> = {
  BASIC: {
    multiCompany: false,
    multiBranch: false,
    fiscalPeriods: false,
    softLockPeriods: false,
    terminalScopedSettings: false,
    auditTrail: false,
  },
  INTERMEDIATE: {
    multiCompany: false,
    multiBranch: true,
    fiscalPeriods: true,
    softLockPeriods: true,
    terminalScopedSettings: false,
    auditTrail: true,
  },
  ADVANCED: {
    multiCompany: true,
    multiBranch: true,
    fiscalPeriods: true,
    softLockPeriods: true,
    terminalScopedSettings: true,
    auditTrail: true,
  },
};

export function resolveSettingsFeatures(
  profile: SettingsFeatureProfile = 'ADVANCED',
): SettingsFeatureFlags {
  if (typeof profile === 'string') {
    return { ...SETTINGS_TIER_PRESETS[profile] };
  }
  return { ...SETTINGS_TIER_PRESETS.ADVANCED, ...profile };
}

export function assertSettingsFeatureEnabled(
  features: Readonly<SettingsFeatureFlags>,
  feature: SettingsFeature,
): void {
  if (!features[feature]) {
    throw new SettingsFeatureDisabledError(feature);
  }
}
