import type { PurchaseOrder, PurchaseOrderStatus } from '../schemas/purchasing.schemas.js';

export interface PurchaseOrderFilter {
  supplierId?: string;
  warehouseId?: string;
  status?: PurchaseOrderStatus;
}

export interface IPurchaseOrderRepository {
  save(order: PurchaseOrder): Promise<void>;
  findById(id: string): Promise<PurchaseOrder | null>;
  findByOrderNumber(orderNumber: string): Promise<PurchaseOrder | null>;
  findAll(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]>;
}
