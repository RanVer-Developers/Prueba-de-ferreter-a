export type PurchasingDomainEvent =
  | {
      type: 'SupplierCreated';
      supplierId: string;
      name: string;
      occurredAt: string;
    }
  | {
      type: 'SupplierUpdated';
      supplierId: string;
      status: string;
      occurredAt: string;
    }
  | {
      type: 'PurchaseOrderCreated';
      purchaseOrderId: string;
      orderNumber: string;
      supplierId: string;
      totalCents: number;
      occurredAt: string;
    }
  | {
      type: 'PurchaseOrderApproved';
      purchaseOrderId: string;
      approvedBy?: string;
      occurredAt: string;
    }
  | {
      type: 'PurchaseOrderSent';
      purchaseOrderId: string;
      occurredAt: string;
    }
  | {
      type: 'PurchaseOrderCancelled';
      purchaseOrderId: string;
      reason?: string;
      occurredAt: string;
    }
  | {
      type: 'PurchaseReceived';
      receiptId: string;
      receiptNumber: string;
      purchaseOrderId?: string;
      supplierId: string;
      warehouseId: string;
      totalCents: number;
      occurredAt: string;
    }
  | {
      type: 'SupplierCostUpdated';
      supplierId: string;
      productId: string;
      previousCostCents?: number;
      newCostCents: number;
      currency: string;
      occurredAt: string;
    }
  | {
      type: 'SupplierPayableCreated';
      payableId: string;
      supplierId: string;
      receiptId: string;
      amountCents: number;
      dueAt: string;
      occurredAt: string;
    }
  | {
      type: 'SupplierPaymentRecorded';
      payableId: string;
      supplierId: string;
      amountCents: number;
      remainingBalanceCents: number;
      occurredAt: string;
    }
  | {
      type: 'SupplierReturnRecorded';
      returnId: string;
      supplierId: string;
      warehouseId: string;
      totalCents: number;
      occurredAt: string;
    };
