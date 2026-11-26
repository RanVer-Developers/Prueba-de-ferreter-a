import { Warehouse } from '../domain/entities/warehouse.js';

export interface IWarehouseRepository {
  findById(id: string): Promise<Warehouse | null>;
  findByCode(code: string): Promise<Warehouse | null>;
  save(warehouse: Warehouse): Promise<void>;
  listAll(): Promise<Warehouse[]>;
}
