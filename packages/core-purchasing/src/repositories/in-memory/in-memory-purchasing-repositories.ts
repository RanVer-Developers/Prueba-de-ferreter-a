import type {
  PurchaseOrder,
  PurchaseReceipt,
  Supplier,
  SupplierPayable,
  SupplierProduct,
  SupplierReturn,
} from '../../schemas/purchasing.schemas.js';
import type {
  IPurchaseOrderRepository,
  PurchaseOrderFilter,
} from '../purchase-order-repository.interface.js';
import type {
  IPurchaseReceiptRepository,
  PurchaseReceiptFilter,
} from '../purchase-receipt-repository.interface.js';
import type {
  ISupplierPayableRepository,
  ISupplierReturnRepository,
  SupplierPayableFilter,
} from '../supplier-payable-repository.interface.js';
import type { ISupplierProductRepository } from '../supplier-product-repository.interface.js';
import type { ISupplierRepository, SupplierFilter } from '../supplier-repository.interface.js';

export class InMemorySupplierRepository implements ISupplierRepository {
  private readonly items = new Map<string, Supplier>();

  async save(supplier: Supplier): Promise<void> {
    this.items.set(supplier.id, structuredClone(supplier));
  }

  async findById(id: string): Promise<Supplier | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByCode(code: string): Promise<Supplier | null> {
    for (const item of this.items.values()) {
      if (item.code === code) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findAll(filter?: SupplierFilter): Promise<Supplier[]> {
    const searchLower = filter?.search?.trim().toLowerCase();
    const results: Supplier[] = [];
    for (const item of this.items.values()) {
      if (filter?.status && item.status !== filter.status) {
        continue;
      }
      if (
        searchLower &&
        !item.name.toLowerCase().includes(searchLower) &&
        !(item.code?.toLowerCase().includes(searchLower) ?? false) &&
        !(item.taxId?.toLowerCase().includes(searchLower) ?? false)
      ) {
        continue;
      }
      results.push(structuredClone(item));
    }
    return results;
  }
}

export class InMemorySupplierProductRepository implements ISupplierProductRepository {
  private readonly items = new Map<string, SupplierProduct>();

  async save(supplierProduct: SupplierProduct): Promise<void> {
    this.items.set(supplierProduct.id, structuredClone(supplierProduct));
  }

  async findBySupplierAndProduct(
    supplierId: string,
    productId: string,
  ): Promise<SupplierProduct | null> {
    for (const item of this.items.values()) {
      if (item.supplierId === supplierId && item.productId === productId) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findBySupplier(supplierId: string): Promise<SupplierProduct[]> {
    const results: SupplierProduct[] = [];
    for (const item of this.items.values()) {
      if (item.supplierId === supplierId) {
        results.push(structuredClone(item));
      }
    }
    return results;
  }

  async findByProduct(productId: string): Promise<SupplierProduct[]> {
    const results: SupplierProduct[] = [];
    for (const item of this.items.values()) {
      if (item.productId === productId) {
        results.push(structuredClone(item));
      }
    }
    return results;
  }
}

export class InMemoryPurchaseOrderRepository implements IPurchaseOrderRepository {
  private readonly items = new Map<string, PurchaseOrder>();

  async save(order: PurchaseOrder): Promise<void> {
    this.items.set(order.id, structuredClone(order));
  }

  async findById(id: string): Promise<PurchaseOrder | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByOrderNumber(orderNumber: string): Promise<PurchaseOrder | null> {
    for (const item of this.items.values()) {
      if (item.orderNumber === orderNumber) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findAll(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]> {
    const results: PurchaseOrder[] = [];
    for (const item of this.items.values()) {
      if (filter?.supplierId && item.supplierId !== filter.supplierId) continue;
      if (filter?.warehouseId && item.warehouseId !== filter.warehouseId) continue;
      if (filter?.status && item.status !== filter.status) continue;
      results.push(structuredClone(item));
    }
    return results;
  }
}

export class InMemoryPurchaseReceiptRepository implements IPurchaseReceiptRepository {
  private readonly items = new Map<string, PurchaseReceipt>();

  async save(receipt: PurchaseReceipt): Promise<void> {
    this.items.set(receipt.id, structuredClone(receipt));
  }

  async findById(id: string): Promise<PurchaseReceipt | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByInvoiceNumber(
    supplierId: string,
    invoiceNumber: string,
  ): Promise<PurchaseReceipt | null> {
    for (const item of this.items.values()) {
      if (item.supplierId === supplierId && item.invoiceNumber === invoiceNumber) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findAll(filter?: PurchaseReceiptFilter): Promise<PurchaseReceipt[]> {
    const results: PurchaseReceipt[] = [];
    for (const item of this.items.values()) {
      if (filter?.supplierId && item.supplierId !== filter.supplierId) continue;
      if (filter?.purchaseOrderId && item.purchaseOrderId !== filter.purchaseOrderId) continue;
      if (filter?.warehouseId && item.warehouseId !== filter.warehouseId) continue;
      results.push(structuredClone(item));
    }
    return results;
  }
}

export class InMemorySupplierPayableRepository implements ISupplierPayableRepository {
  private readonly items = new Map<string, SupplierPayable>();

  async save(payable: SupplierPayable): Promise<void> {
    this.items.set(payable.id, structuredClone(payable));
  }

  async findById(id: string): Promise<SupplierPayable | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByReceiptId(receiptId: string): Promise<SupplierPayable | null> {
    for (const item of this.items.values()) {
      if (item.receiptId === receiptId) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findAll(filter?: SupplierPayableFilter): Promise<SupplierPayable[]> {
    const results: SupplierPayable[] = [];
    for (const item of this.items.values()) {
      if (filter?.supplierId && item.supplierId !== filter.supplierId) continue;
      if (filter?.status && item.status !== filter.status) continue;
      results.push(structuredClone(item));
    }
    return results;
  }

  async getOpenBalanceCentsBySupplier(supplierId: string): Promise<number> {
    let total = 0;
    for (const item of this.items.values()) {
      if (item.supplierId === supplierId && (item.status === 'OPEN' || item.status === 'PARTIAL')) {
        total += item.balanceCents;
      }
    }
    return total;
  }
}

export class InMemorySupplierReturnRepository implements ISupplierReturnRepository {
  private readonly items = new Map<string, SupplierReturn>();

  async save(supplierReturn: SupplierReturn): Promise<void> {
    this.items.set(supplierReturn.id, structuredClone(supplierReturn));
  }

  async findById(id: string): Promise<SupplierReturn | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findBySupplier(supplierId: string): Promise<SupplierReturn[]> {
    const results: SupplierReturn[] = [];
    for (const item of this.items.values()) {
      if (item.supplierId === supplierId) {
        results.push(structuredClone(item));
      }
    }
    return results;
  }
}
