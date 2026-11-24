import { FeatureDisabledError } from '../errors/auth-rbac-errors.js';

/**
 * Complexity tiers to adapt @modulos/core-auth-rbac across simple POS, mid-market retail,
 * and enterprise multi-tenant / multi-branch platforms.
 */
export type AuthRbacTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Granular capabilities controlled via `AuthRbacTier` or `AuthRbacFeatureFlags`.
 */
export type AuthRbacFeature =
  | 'granularPermissions'
  | 'explicitDeny'
  | 'roleInheritance'
  | 'scopedRoles'
  | 'pinAuth'
  | 'sessionManagement'
  | 'refreshTokens'
  | 'bruteForceProtection'
  | 'supervisorOverride'
  | 'optimisticConcurrency'
  | 'auditTrail'
  | 'passwordPolicy'
  | 'sessionConcurrencyLimit'
  | 'temporaryRoleGrants'
  | 'mfaChallenge';

export type AuthRbacFeatureFlags = Record<AuthRbacFeature, boolean>;

export type AuthRbacFeatureProfile = AuthRbacTier | Partial<AuthRbacFeatureFlags>;

export const AUTH_RBAC_TIER_PRESETS: Readonly<Record<AuthRbacTier, Readonly<AuthRbacFeatureFlags>>> = {
  BASIC: {
    granularPermissions: false,
    explicitDeny: false,
    roleInheritance: false,
    scopedRoles: false,
    pinAuth: true,
    sessionManagement: true,
    refreshTokens: false,
    bruteForceProtection: false,
    supervisorOverride: false,
    optimisticConcurrency: true,
    auditTrail: false,
    passwordPolicy: false,
    sessionConcurrencyLimit: false,
    temporaryRoleGrants: false,
    mfaChallenge: false,
  },
  INTERMEDIATE: {
    granularPermissions: true,
    explicitDeny: false,
    roleInheritance: true,
    scopedRoles: false,
    pinAuth: true,
    sessionManagement: true,
    refreshTokens: true,
    bruteForceProtection: true,
    supervisorOverride: true,
    optimisticConcurrency: true,
    auditTrail: true,
    passwordPolicy: true,
    sessionConcurrencyLimit: false,
    temporaryRoleGrants: false,
    mfaChallenge: false,
  },
  ADVANCED: {
    granularPermissions: true,
    explicitDeny: true,
    roleInheritance: true,
    scopedRoles: true,
    pinAuth: true,
    sessionManagement: true,
    refreshTokens: true,
    bruteForceProtection: true,
    supervisorOverride: true,
    optimisticConcurrency: true,
    auditTrail: true,
    passwordPolicy: true,
    sessionConcurrencyLimit: true,
    temporaryRoleGrants: true,
    mfaChallenge: true,
  },
};

export function resolveAuthRbacFeatures(
  profile?: AuthRbacFeatureProfile,
  baseTier: AuthRbacTier = 'ADVANCED'
): AuthRbacFeatureFlags {
  if (!profile) {
    return { ...AUTH_RBAC_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...AUTH_RBAC_TIER_PRESETS[profile] };
  }
  return {
    ...AUTH_RBAC_TIER_PRESETS[baseTier],
    ...profile,
  };
}

export function createAuthRbacFeatureFlags(
  baseTier: AuthRbacTier,
  overrides: Partial<AuthRbacFeatureFlags> = {}
): AuthRbacFeatureFlags {
  return {
    ...AUTH_RBAC_TIER_PRESETS[baseTier],
    ...overrides,
  };
}

export function isAuthRbacFeatureEnabled(
  flags: AuthRbacFeatureFlags | undefined,
  feature: AuthRbacFeature
): boolean {
  if (!flags) return true;
  return flags[feature] === true;
}

export function assertAuthRbacFeatureEnabled(
  flags: AuthRbacFeatureFlags | undefined,
  feature: AuthRbacFeature,
  details?: string
): void {
  if (!isAuthRbacFeatureEnabled(flags, feature)) {
    throw new FeatureDisabledError(feature, details);
  }
}
