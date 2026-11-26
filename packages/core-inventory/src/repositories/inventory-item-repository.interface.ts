import { InventoryItem } from '../domain/entities/inventory-item.js';

export interface IInventoryItemRepository {
  findById(id: string): Promise<InventoryItem | null>;
  findBySku(sku: string): Promise<InventoryItem | null>;
  findByBarcode(barcode: string): Promise<InventoryItem | null>;
  save(item: InventoryItem): Promise<void>;
  listAll(): Promise<InventoryItem[]>;
  listLowStock(warehouseId: string): Promise<InventoryItem[]>;
}
