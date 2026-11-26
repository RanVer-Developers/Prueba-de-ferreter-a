import { InventoryCount } from '../../domain/entities/inventory-count.js';
import { IInventoryCountRepository } from '../inventory-count-repository.interface.js';

export class InMemoryInventoryCountRepository implements IInventoryCountRepository {
  private readonly counts = new Map<string, InventoryCount>();

  public async findById(id: string): Promise<InventoryCount | null> {
    const c = this.counts.get(id);
    if (!c) return null;
    return InventoryCount.fromJSON(c.toJSON());
  }

  public async save(count: InventoryCount): Promise<void> {
    this.counts.set(count.id, InventoryCount.fromJSON(count.toJSON()));
  }

  public async listByWarehouse(warehouseId: string): Promise<InventoryCount[]> {
    return Array.from(this.counts.values())
      .filter((c) => c.warehouseId === warehouseId)
      .map((c) => InventoryCount.fromJSON(c.toJSON()));
  }
}
