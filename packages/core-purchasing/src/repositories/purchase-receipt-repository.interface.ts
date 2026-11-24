import type { PurchaseReceipt } from '../schemas/purchasing.schemas.js';

export interface PurchaseReceiptFilter {
  supplierId?: string;
  purchaseOrderId?: string;
  warehouseId?: string;
}

export interface IPurchaseReceiptRepository {
  save(receipt: PurchaseReceipt): Promise<void>;
  findById(id: string): Promise<PurchaseReceipt | null>;
  findByInvoiceNumber(supplierId: string, invoiceNumber: string): Promise<PurchaseReceipt | null>;
  findAll(filter?: PurchaseReceiptFilter): Promise<PurchaseReceipt[]>;
}
