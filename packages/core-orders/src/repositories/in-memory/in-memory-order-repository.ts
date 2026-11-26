import { IOrderRepository, OrderQueryFilter } from '../../contracts/order-contracts.js';
import { Order } from '../../domain/entities/order.js';
import { ConcurrencyError } from '../../domain/errors/order-errors.js';
import { OrderSnapshot } from '../../schemas/order-schemas.js';

export interface InMemoryOrderRepositoryOptions {
  /**
   * When true, stores and returns deep-cloned snapshots and enforces optimistic concurrency
   * via `ConcurrencyError` just like a real database adapter.
   */
  isolate?: boolean;
}

export class InMemoryOrderRepository implements IOrderRepository {
  private readonly items = new Map<string, Order>();
  private readonly snapshots = new Map<string, OrderSnapshot>();
  private readonly isolate: boolean;

  constructor(options: InMemoryOrderRepositoryOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  private load(id: string): Order | null {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? Order.fromSnapshot(structuredClone(snap)) : null;
    }
    return this.items.get(id) ?? null;
  }

  private all(): Order[] {
    if (this.isolate) {
      return Array.from(this.snapshots.keys()).map((id) => this.load(id)!);
    }
    return Array.from(this.items.values());
  }

  public async findById(id: string): Promise<Order | null> {
    return this.load(id);
  }

  public async findByIdempotencyKey(key: string): Promise<Order | null> {
    const normalized = key.trim();
    for (const order of this.all()) {
      if (order.idempotencyKey === normalized) {
        return order;
      }
    }
    return null;
  }

  public async save(order: Order): Promise<void> {
    if (this.isolate) {
      const stored = this.snapshots.get(order.id);
      if (stored && stored.version !== order.persistedVersion) {
        throw new ConcurrencyError(order.id, order.persistedVersion, stored.version);
      }
      this.snapshots.set(order.id, structuredClone(order.toSnapshot()));
      order.markPersisted();
      return;
    }

    this.items.set(order.id, order);
    order.markPersisted();
  }

  public async findByFilter(filter: OrderQueryFilter): Promise<Order[]> {
    const filtered = this.all().filter((order) => {
      if (filter.statuses && !filter.statuses.includes(order.status)) {
        return false;
      }
      if (filter.customerId && order.customerId !== filter.customerId) {
        return false;
      }
      if (filter.channel && order.channel !== filter.channel) {
        return false;
      }
      if (filter.from && order.createdAt < filter.from) {
        return false;
      }
      if (filter.to && order.createdAt > filter.to) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filter.limit !== undefined && filter.limit >= 0) {
      return filtered.slice(0, filter.limit);
    }
    return filtered;
  }

  public clear(): void {
    this.items.clear();
    this.snapshots.clear();
  }
}
