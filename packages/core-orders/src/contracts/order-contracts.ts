import { Order } from '../domain/entities/order.js';
import { OrderDomainEvent } from '../domain/events/order-events.js';
import { CouponDefinition, OrderChannel, OrderStatus } from '../schemas/order-schemas.js';

export interface OrderQueryFilter {
  statuses?: OrderStatus[];
  customerId?: string;
  channel?: OrderChannel;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  findByIdempotencyKey(key: string): Promise<Order | null>;
  /**
   * Persists the order. Real repositories must enforce optimistic concurrency by comparing
   * `order.persistedVersion` with the stored version and throwing `ConcurrencyError` on mismatch,
   * then calling `order.markPersisted()`.
   */
  save(order: Order): Promise<void>;
  findByFilter?(filter: OrderQueryFilter): Promise<Order[]>;
}

export interface ICouponCatalog {
  findByCode(code: string): Promise<CouponDefinition | null>;
  incrementUsage?(code: string): Promise<void>;
}

export interface IClock {
  now(): Date;
}

export const SystemClock: IClock = {
  now: () => new Date(),
};

export type OrderEventPublisher = (event: OrderDomainEvent) => Promise<void> | void;
