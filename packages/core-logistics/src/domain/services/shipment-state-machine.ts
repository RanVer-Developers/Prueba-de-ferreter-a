import {
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
  ShipmentStatus,
} from '../../schemas/logistics-schemas.js';
import {
  FeatureDisabledError,
  InvalidShipmentStateError,
} from '../errors/logistics-errors.js';

const BASE_TRANSITIONS: Record<ShipmentStatus, ReadonlyArray<ShipmentStatus>> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'PENDING', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'RETURNED'],
  FAILED: ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED'],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

export const TERMINAL_SHIPMENT_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
]);

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return TERMINAL_SHIPMENT_STATUSES.has(status);
}

export function getAllowedShipmentTransitions(
  current: ShipmentStatus,
  flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
): ReadonlyArray<ShipmentStatus> {
  const allowed = BASE_TRANSITIONS[current];
  if (current === 'FAILED' && !flags.allowReturnFromFailed) {
    return allowed.filter((s) => s !== 'RETURNED');
  }
  return allowed;
}

export function assertValidShipmentTransition(
  shipmentId: string,
  current: ShipmentStatus,
  target: ShipmentStatus,
  flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
): void {
  if (current === 'FAILED' && target === 'RETURNED' && !flags.allowReturnFromFailed) {
    throw new FeatureDisabledError(
      'allowReturnFromFailed',
      'Returning shipments from FAILED status is disabled.'
    );
  }

  const allowed = getAllowedShipmentTransitions(current, flags);
  if (!allowed.includes(target)) {
    throw new InvalidShipmentStateError(shipmentId, current, target);
  }
}
