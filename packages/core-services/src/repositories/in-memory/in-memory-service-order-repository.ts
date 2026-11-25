import { ServicesConcurrencyError } from '../../domain/errors/services-errors.js';
import type { ServiceOrder } from '../../schemas/services.schemas.js';
import type {
  IServiceOrderRepository,
  ServiceOrderFilter,
} from '../service-order-repository.interface.js';

export class InMemoryServiceOrderRepository implements IServiceOrderRepository {
  private readonly items = new Map<string, ServiceOrder>();

  async save(order: ServiceOrder, expectedVersion?: number): Promise<void> {
    if (expectedVersion !== undefined) {
      const existing = this.items.get(order.id);
      if (!existing || existing.version !== expectedVersion) {
        throw new ServicesConcurrencyError(order.id, expectedVersion);
      }
    }
    this.items.set(order.id, structuredClone(order));
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ServiceOrder | null> {
    for (const item of this.items.values()) {
      if (item.processedIdempotencyKeys.includes(idempotencyKey)) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findAll(filter?: ServiceOrderFilter): Promise<ServiceOrder[]> {
    const results: ServiceOrder[] = [];
    for (const item of this.items.values()) {
      if (filter?.branchId && item.branchId !== filter.branchId) continue;
      if (filter?.customerId && item.customerId !== filter.customerId) continue;
      if (filter?.assignedTechnicianId && item.assignedTechnicianId !== filter.assignedTechnicianId) {
        continue;
      }
      if (filter?.type && item.type !== filter.type) continue;
      if (filter?.status && item.status !== filter.status) continue;
      results.push(structuredClone(item));
    }
    return results;
  }
}
