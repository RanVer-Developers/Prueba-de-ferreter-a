import {
  ActorSummary,
  DeliveryFailureReason,
  DeliveryRouteStatus,
  ProofOfDelivery,
  ShipmentStatus,
} from '../../schemas/logistics-schemas.js';

export interface LogisticsDomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}

export class ShipmentCreatedEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.ShipmentCreated';
  public readonly occurredAt: Date;

  constructor(
    public readonly shipmentId: string,
    public readonly trackingCode: string,
    public readonly orderId?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class ShipmentAssignedEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.ShipmentAssigned';
  public readonly occurredAt: Date;

  constructor(
    public readonly shipmentId: string,
    public readonly driverId: string,
    public readonly routeId?: string,
    public readonly actor?: ActorSummary,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class ShipmentStatusChangedEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.ShipmentStatusChanged';
  public readonly occurredAt: Date;

  constructor(
    public readonly shipmentId: string,
    public readonly previousStatus: ShipmentStatus,
    public readonly newStatus: ShipmentStatus,
    public readonly actor?: ActorSummary,
    public readonly note?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class DeliveryAttemptFailedEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.DeliveryAttemptFailed';
  public readonly occurredAt: Date;

  constructor(
    public readonly shipmentId: string,
    public readonly attemptNumber: number,
    public readonly reason: DeliveryFailureReason,
    public readonly driverId?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class ShipmentDeliveredEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.ShipmentDelivered';
  public readonly occurredAt: Date;

  constructor(
    public readonly shipmentId: string,
    public readonly proofOfDelivery: ProofOfDelivery,
    public readonly driverId?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class RouteCreatedEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.RouteCreated';
  public readonly occurredAt: Date;

  constructor(
    public readonly routeId: string,
    public readonly driverId: string,
    public readonly stopCount: number,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class RouteStatusChangedEvent implements LogisticsDomainEvent {
  public readonly eventName = 'Logistics.RouteStatusChanged';
  public readonly occurredAt: Date;

  constructor(
    public readonly routeId: string,
    public readonly previousStatus: DeliveryRouteStatus,
    public readonly newStatus: DeliveryRouteStatus,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}
