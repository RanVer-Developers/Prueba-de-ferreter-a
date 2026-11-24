import { ActorSummary, DiscountRule, OrderStatus } from '../../schemas/order-schemas.js';
import { Order, OrderLine } from '../entities/order.js';
import { OrderPricingSummary } from '../services/order-pricing.service.js';

export interface OrderDomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}

export class OrderCreatedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.Created';
  public readonly occurredAt: Date;

  constructor(
    public readonly order: Order,
    public readonly summary: OrderPricingSummary,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class OrderLineAddedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.LineAdded';
  public readonly occurredAt: Date;

  constructor(
    public readonly orderId: string,
    public readonly line: OrderLine,
    public readonly summary: OrderPricingSummary,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class OrderLineUpdatedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.LineUpdated';
  public readonly occurredAt: Date;

  constructor(
    public readonly orderId: string,
    public readonly line: OrderLine,
    public readonly summary: OrderPricingSummary,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class OrderLineRemovedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.LineRemoved';
  public readonly occurredAt: Date;

  constructor(
    public readonly orderId: string,
    public readonly lineId: string,
    public readonly summary: OrderPricingSummary,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class OrderDiscountAppliedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.DiscountApplied';
  public readonly occurredAt: Date;

  constructor(
    public readonly orderId: string,
    public readonly discount: DiscountRule,
    public readonly scope: 'ORDER' | 'LINE',
    public readonly summary: OrderPricingSummary,
    public readonly lineId?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class OrderDiscountRemovedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.DiscountRemoved';
  public readonly occurredAt: Date;

  constructor(
    public readonly orderId: string,
    public readonly discountId: string,
    public readonly scope: 'ORDER' | 'LINE',
    public readonly summary: OrderPricingSummary,
    public readonly lineId?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}

export class OrderStatusChangedEvent implements OrderDomainEvent {
  public readonly eventName = 'Order.StatusChanged';
  public readonly occurredAt: Date;

  constructor(
    public readonly orderId: string,
    public readonly previousStatus: OrderStatus,
    public readonly newStatus: OrderStatus,
    public readonly summary: OrderPricingSummary,
    public readonly actor?: ActorSummary,
    public readonly reason?: string,
    occurredAt?: Date
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}
