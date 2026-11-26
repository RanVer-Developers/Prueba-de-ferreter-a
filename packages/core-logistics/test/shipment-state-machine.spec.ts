import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  FeatureDisabledError,
  InvalidShipmentStateError,
  assertValidShipmentTransition,
  getAllowedShipmentTransitions,
  isTerminalShipmentStatus,
} from '../src/index.js';

describe('Shipment State Machine', () => {
  it('allows standard happy path transitions', () => {
    expect(() => assertValidShipmentTransition('s1', 'PENDING', 'ASSIGNED')).not.toThrow();
    expect(() => assertValidShipmentTransition('s1', 'ASSIGNED', 'PICKED_UP')).not.toThrow();
    expect(() => assertValidShipmentTransition('s1', 'PICKED_UP', 'IN_TRANSIT')).not.toThrow();
    expect(() => assertValidShipmentTransition('s1', 'IN_TRANSIT', 'DELIVERED')).not.toThrow();
  });

  it('blocks invalid transitions and terminal statuses', () => {
    expect(() => assertValidShipmentTransition('s1', 'PENDING', 'DELIVERED')).toThrow(
      InvalidShipmentStateError
    );
    expect(() => assertValidShipmentTransition('s1', 'DELIVERED', 'RETURNED')).toThrow(
      InvalidShipmentStateError
    );
    expect(isTerminalShipmentStatus('DELIVERED')).toBe(true);
    expect(isTerminalShipmentStatus('CANCELLED')).toBe(true);
    expect(isTerminalShipmentStatus('RETURNED')).toBe(true);
    expect(isTerminalShipmentStatus('IN_TRANSIT')).toBe(false);
  });

  it('respects allowReturnFromFailed feature flag', () => {
    const flags = { ...DEFAULT_LOGISTICS_FEATURE_FLAGS, allowReturnFromFailed: false };
    expect(getAllowedShipmentTransitions('FAILED', flags)).not.toContain('RETURNED');
    expect(() => assertValidShipmentTransition('s1', 'FAILED', 'RETURNED', flags)).toThrow(
      FeatureDisabledError
    );
  });
});
