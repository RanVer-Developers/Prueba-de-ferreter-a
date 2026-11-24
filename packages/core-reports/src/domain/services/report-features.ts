import { ReportFeatureDisabledError } from '../errors/report-errors.js';

export type ReportTier = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export interface ReportFeatureFlags {
  /** Basic sales summary, payment breakdown, and top items ranking */
  salesSummary: boolean;
  /** Time-series bucketing (hour, day, week, month) */
  timeSeries: boolean;
  /** Category and channel/branch breakdowns */
  dimensionalBreakdown: boolean;
  /** Cost of goods, gross profit, and margin (bps) */
  profitabilityMetrics: boolean;
  /** Period-over-period comparison with delta and trend */
  periodComparison: boolean;
  /** Inventory valuation and ABC Pareto classification */
  abcParetoAnalytics: boolean;
  /** Customer retention, repeat buyers, and average LTV */
  customerAnalytics: boolean;
  /** Structured CSV/JSON export formatting */
  dataExport: boolean;
  /** Saved/scheduled report definitions */
  savedDefinitions: boolean;
}

export type ReportFeature = keyof ReportFeatureFlags;

export interface ReportFeatureProfile {
  tier: ReportTier;
  features: ReportFeatureFlags;
}

/**
 * Standard monorepo feature-profile input (`ReportTier`, partial flat flags, or legacy `ReportFeatureProfile`).
 */
export type ReportFeatureProfileInput =
  | ReportTier
  | Partial<ReportFeatureFlags>
  | ReportFeatureProfile;

export const REPORT_TIER_PRESETS: Record<ReportTier, ReportFeatureFlags> = {
  BASIC: {
    salesSummary: true,
    timeSeries: false,
    dimensionalBreakdown: false,
    profitabilityMetrics: false,
    periodComparison: false,
    abcParetoAnalytics: false,
    customerAnalytics: false,
    dataExport: false,
    savedDefinitions: false,
  },
  INTERMEDIATE: {
    salesSummary: true,
    timeSeries: true,
    dimensionalBreakdown: true,
    profitabilityMetrics: true,
    periodComparison: true,
    abcParetoAnalytics: false,
    customerAnalytics: false,
    dataExport: true,
    savedDefinitions: true,
  },
  ADVANCED: {
    salesSummary: true,
    timeSeries: true,
    dimensionalBreakdown: true,
    profitabilityMetrics: true,
    periodComparison: true,
    abcParetoAnalytics: true,
    customerAnalytics: true,
    dataExport: true,
    savedDefinitions: true,
  },
};

function isReportFeatureProfileObject(value: unknown): value is ReportFeatureProfile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tier' in value &&
    'features' in value &&
    typeof (value as ReportFeatureProfile).features === 'object' &&
    (value as ReportFeatureProfile).features !== null
  );
}

/**
 * Legacy helper preserved for backward compatibility (`{ tier, features }`).
 * For the standard flat `Record<ReportFeature, boolean>` map, use `resolveReportFeatureFlags`.
 */
export function resolveReportFeatures(
  tier: ReportTier = 'BASIC',
  overrides?: Partial<ReportFeatureFlags>
): ReportFeatureProfile {
  return {
    tier,
    features: {
      ...REPORT_TIER_PRESETS[tier],
      ...overrides,
    },
  };
}

/**
 * Standard monorepo resolver returning flat `ReportFeatureFlags` (`Record<ReportFeature, boolean>`).
 */
export function resolveReportFeatureFlags(
  profile?: ReportFeatureProfileInput,
  baseTier: ReportTier = 'BASIC'
): ReportFeatureFlags {
  if (!profile) {
    return { ...REPORT_TIER_PRESETS[baseTier] };
  }
  if (typeof profile === 'string') {
    return { ...REPORT_TIER_PRESETS[profile] };
  }
  if (isReportFeatureProfileObject(profile)) {
    return {
      ...REPORT_TIER_PRESETS[profile.tier],
      ...profile.features,
    };
  }
  return {
    ...REPORT_TIER_PRESETS[baseTier],
    ...profile,
  };
}

export function assertReportFeatureEnabled(
  profileOrFlags: ReportFeatureProfile | ReportFeatureFlags,
  feature: ReportFeature,
  details?: string
): void {
  const flags = isReportFeatureProfileObject(profileOrFlags)
    ? profileOrFlags.features
    : profileOrFlags;
  if (!flags[feature]) {
    throw new ReportFeatureDisabledError(feature, details);
  }
}
