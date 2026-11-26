import { describe, expect, it } from 'vitest';
import {
  FeatureDisabledError,
  LOGISTICS_TIER_PRESETS,
  assertLogisticsFeatureEnabled,
  composeLogisticsFeatures,
  resolveLogisticsFeatures,
  splitLogisticsFeatures,
} from '../src/index.js';

describe('@modulos/core-logistics feature tiers', () => {
  it('resolves BASIC, INTERMEDIATE, and ADVANCED tier presets and enforces boolean flags', () => {
    const basic = resolveLogisticsFeatures('BASIC');
    expect(basic.enableDistanceRates).toBe(false);
    expect(basic.requireProofOfDelivery).toBe(false);
    expect(basic.maxDeliveryAttempts).toBe(3);

    const intermediate = resolveLogisticsFeatures('INTERMEDIATE');
    expect(intermediate.requireProofOfDelivery).toBe(true);
    expect(intermediate.requireDeliveryPin).toBe(false);

    const advanced = resolveLogisticsFeatures('ADVANCED');
    expect(advanced).toEqual(LOGISTICS_TIER_PRESETS.ADVANCED);
    expect(advanced.requireDeliveryPin).toBe(true);
    expect(advanced.maxDeliveryAttempts).toBe(5);

    expect(() => assertLogisticsFeatureEnabled(basic, 'requireDeliveryPin')).toThrow(
      FeatureDisabledError,
    );
  });

  it('splits boolean feature flags from numeric maxDeliveryAttempts policy cleanly', () => {
    const resolved = resolveLogisticsFeatures('ADVANCED');
    const { features, policy } = splitLogisticsFeatures(resolved);

    expect(policy).toEqual({ maxDeliveryAttempts: 5 });
    expect('maxDeliveryAttempts' in features).toBe(false);
    expect(features.requireDeliveryPin).toBe(true);

    const recomposed = composeLogisticsFeatures(
      { requireDeliveryPin: true },
      { maxDeliveryAttempts: 4 },
      'BASIC',
    );
    expect(recomposed.requireDeliveryPin).toBe(true);
    expect(recomposed.maxDeliveryAttempts).toBe(4);
    expect(recomposed.enableDistanceRates).toBe(false);
  });
});
