import { InventoryItem } from '../../domain/entities/inventory-item.js';
import { ConcurrencyError } from '../../domain/errors/inventory-errors.js';
import { IInventoryItemRepository } from '../inventory-item-repository.interface.js';

export class InMemoryInventoryRepository implements IInventoryItemRepository {
  private readonly items = new Map<string, InventoryItem>();
  private readonly versions = new Map<string, number>();

  public async findById(id: string): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    if (!item) return null;
    return InventoryItem.fromJSON(item.toJSON());
  }

  public async findBySku(sku: string): Promise<InventoryItem | null> {
    const cleanSku = sku.trim().toUpperCase();
    for (const item of this.items.values()) {
      if (item.sku.toUpperCase() === cleanSku) {
        return InventoryItem.fromJSON(item.toJSON());
      }
    }
    return null;
  }

  public async findByBarcode(barcode: string): Promise<InventoryItem | null> {
    const cleanBarcode = barcode.trim();
    for (const item of this.items.values()) {
      if (item.matchesBarcode(cleanBarcode)) {
        return InventoryItem.fromJSON(item.toJSON());
      }
    }
    return null;
  }

  public async save(item: InventoryItem): Promise<void> {
    const currentStored = this.items.get(item.id);
    const expectedVersion = this.versions.get(item.id) ?? 1;

    // Control de concurrencia optimista
    if (currentStored && item.version <= expectedVersion) {
      throw new ConcurrencyError(item.id, expectedVersion + 1, item.version);
    }

    this.items.set(item.id, InventoryItem.fromJSON(item.toJSON()));
    this.versions.set(item.id, item.version);
  }

  public async listAll(): Promise<InventoryItem[]> {
    return Array.from(this.items.values()).map((it) => InventoryItem.fromJSON(it.toJSON()));
  }

  public async listLowStock(warehouseId: string): Promise<InventoryItem[]> {
    return (await this.listAll()).filter((it) => it.isLowStock(warehouseId));
  }
}
