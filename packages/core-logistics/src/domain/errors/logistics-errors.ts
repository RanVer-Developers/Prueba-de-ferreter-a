/**
 * Base domain error for all exceptions in the logistics module.
 */
export class LogisticsDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidLogisticsInputError extends LogisticsDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class ShipmentNotFoundError extends LogisticsDomainError {
  constructor(shipmentId: string) {
    super(`Shipment '${shipmentId}' was not found.`);
  }
}

export class DriverNotFoundError extends LogisticsDomainError {
  constructor(driverId: string) {
    super(`Driver '${driverId}' was not found.`);
  }
}

export class RouteNotFoundError extends LogisticsDomainError {
  constructor(routeId: string) {
    super(`Delivery route '${routeId}' was not found.`);
  }
}

export class InvalidShipmentStateError extends LogisticsDomainError {
  constructor(shipmentId: string, currentStatus: string, targetStatus: string) {
    super(
      `Invalid state transition for shipment '${shipmentId}': cannot move from '${currentStatus}' to '${targetStatus}'.`
    );
  }
}

export class InvalidRouteStateError extends LogisticsDomainError {
  constructor(routeId: string, currentStatus: string, operation: string) {
    super(
      `Cannot execute '${operation}' on delivery route '${routeId}' while in status '${currentStatus}'.`
    );
  }
}

export class InvalidDriverStateError extends LogisticsDomainError {
  constructor(driverId: string, status: string, operation: string) {
    super(
      `Cannot execute '${operation}' for driver '${driverId}' while in status '${status}'.`
    );
  }
}

export class DriverCapacityExceededError extends LogisticsDomainError {
  constructor(driverId: string, reason: string) {
    super(`Driver '${driverId}' capacity exceeded: ${reason}`);
  }
}

export class ProofOfDeliveryRequiredError extends LogisticsDomainError {
  constructor(shipmentId: string, reason: string) {
    super(`Proof of delivery required for shipment '${shipmentId}': ${reason}`);
  }
}

export class InvalidDeliveryPinError extends LogisticsDomainError {
  constructor(shipmentId: string) {
    super(`Invalid delivery verification PIN for shipment '${shipmentId}'.`);
  }
}

export class MaxDeliveryAttemptsExceededError extends LogisticsDomainError {
  constructor(shipmentId: string, maxAttempts: number) {
    super(
      `Shipment '${shipmentId}' has reached the maximum of ${maxAttempts} delivery attempts.`
    );
  }
}

export class ShippingRateError extends LogisticsDomainError {
  constructor(reason: string) {
    super(`Shipping rate calculation failed: ${reason}`);
  }
}

export class ConcurrencyError extends LogisticsDomainError {
  constructor(entityType: string, entityId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Concurrency conflict on ${entityType} '${entityId}': expected persisted version ${expectedVersion}, found ${currentVersion}.`
    );
  }
}

export class FeatureDisabledError extends LogisticsDomainError {
  public readonly feature: string;

  constructor(feature: string, details?: string) {
    super(
      details
        ? `Logistics feature '${feature}' is disabled: ${details}`
        : `Logistics feature '${feature}' is disabled by configuration.`
    );
    this.feature = feature;
  }
}
