import type {
  PayableStatus,
  SupplierPayable,
  SupplierReturn,
} from '../schemas/purchasing.schemas.js';

export interface SupplierPayableFilter {
  supplierId?: string;
  status?: PayableStatus;
}

export interface ISupplierPayableRepository {
  save(payable: SupplierPayable): Promise<void>;
  findById(id: string): Promise<SupplierPayable | null>;
  findByReceiptId(receiptId: string): Promise<SupplierPayable | null>;
  findAll(filter?: SupplierPayableFilter): Promise<SupplierPayable[]>;
  getOpenBalanceCentsBySupplier(supplierId: string): Promise<number>;
}

export interface ISupplierReturnRepository {
  save(supplierReturn: SupplierReturn): Promise<void>;
  findById(id: string): Promise<SupplierReturn | null>;
  findBySupplier(supplierId: string): Promise<SupplierReturn[]>;
}
