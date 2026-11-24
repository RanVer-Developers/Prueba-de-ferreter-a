import { InventoryCount } from '../domain/entities/inventory-count.js';

export interface IInventoryCountRepository {
  findById(id: string): Promise<InventoryCount | null>;
  save(count: InventoryCount): Promise<void>;
  listByWarehouse(warehouseId: string): Promise<InventoryCount[]>;
}
