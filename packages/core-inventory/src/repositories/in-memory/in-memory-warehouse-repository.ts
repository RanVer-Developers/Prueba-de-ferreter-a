import { Warehouse } from '../../domain/entities/warehouse.js';
import { IWarehouseRepository } from '../warehouse-repository.interface.js';

export class InMemoryWarehouseRepository implements IWarehouseRepository {
  private readonly warehouses = new Map<string, Warehouse>();

  public async findById(id: string): Promise<Warehouse | null> {
    const wh = this.warehouses.get(id);
    if (!wh) return null;
    return Warehouse.fromJSON(wh.toJSON());
  }

  public async findByCode(code: string): Promise<Warehouse | null> {
    const cleanCode = code.trim().toUpperCase();
    for (const wh of this.warehouses.values()) {
      if (wh.code.toUpperCase() === cleanCode) {
        return Warehouse.fromJSON(wh.toJSON());
      }
    }
    return null;
  }

  public async save(warehouse: Warehouse): Promise<void> {
    this.warehouses.set(warehouse.id, Warehouse.fromJSON(warehouse.toJSON()));
  }

  public async listAll(): Promise<Warehouse[]> {
    return Array.from(this.warehouses.values()).map((wh) => Warehouse.fromJSON(wh.toJSON()));
  }
}
