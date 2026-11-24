import type { Supplier, SupplierStatus } from '../schemas/purchasing.schemas.js';

export interface SupplierFilter {
  status?: SupplierStatus;
  search?: string;
}

export interface ISupplierRepository {
  save(supplier: Supplier): Promise<void>;
  findById(id: string): Promise<Supplier | null>;
  findByCode(code: string): Promise<Supplier | null>;
  findAll(filter?: SupplierFilter): Promise<Supplier[]>;
}
