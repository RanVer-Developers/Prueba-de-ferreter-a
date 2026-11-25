import type { ServicesDomainEvent } from '../domain/events/services-events.js';

export interface ServiceInventoryConsumptionInput {
  readonly serviceOrderId: string;
  readonly orderNumber: string;
  readonly warehouseId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostCents: number;
  readonly occurredAt: string;
}

export interface IServiceInventoryPort {
  consumePartStock(input: ServiceInventoryConsumptionInput): Promise<void>;
}

export interface ServiceBillingNotificationInput {
  readonly serviceOrderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly deliveredAt: string;
}

export interface IServiceBillingPort {
  notifyServiceReadyForBilling(input: ServiceBillingNotificationInput): Promise<void>;
}

export interface IServicesEventBus {
  publish(event: ServicesDomainEvent): Promise<void> | void;
}

export interface IServicesClock {
  now(): Date;
}

export class SystemServicesClock implements IServicesClock {
  now(): Date {
    return new Date();
  }
}
