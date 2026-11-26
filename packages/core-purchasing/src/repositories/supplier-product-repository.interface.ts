import type { SupplierProduct } from '../schemas/purchasing.schemas.js';

export interface ISupplierProductRepository {
  save(supplierProduct: SupplierProduct): Promise<void>;
  findBySupplierAndProduct(supplierId: string, productId: string): Promise<SupplierProduct | null>;
  findBySupplier(supplierId: string): Promise<SupplierProduct[]>;
  findByProduct(productId: string): Promise<SupplierProduct[]>;
}
