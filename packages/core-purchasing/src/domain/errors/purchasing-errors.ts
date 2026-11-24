/**
 * Base domain error for all exceptions in the purchasing module.
 */
export class PurchasingDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidPurchasingInputError extends PurchasingDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class PurchasingFeatureDisabledError extends PurchasingDomainError {
  constructor(feature: string) {
    super(`Purchasing feature '${feature}' is disabled in the current profile.`);
  }
}

export class SupplierNotFoundError extends PurchasingDomainError {
  constructor(supplierId: string) {
    super(`Supplier '${supplierId}' was not found.`);
  }
}

export class SupplierInactiveError extends PurchasingDomainError {
  constructor(supplierId: string, status: string) {
    super(`Supplier '${supplierId}' is '${status}' and cannot be used for purchasing.`);
  }
}

export class SupplierProductNotFoundError extends PurchasingDomainError {
  constructor(supplierId: string, productId: string) {
    super(`Product '${productId}' is not linked to supplier '${supplierId}'.`);
  }
}

export class PurchaseOrderNotFoundError extends PurchasingDomainError {
  constructor(purchaseOrderId: string) {
    super(`Purchase order '${purchaseOrderId}' was not found.`);
  }
}

export class InvalidPurchaseOrderStateError extends PurchasingDomainError {
  constructor(purchaseOrderId: string, currentStatus: string, operation: string) {
    super(
      `Cannot execute '${operation}' on purchase order '${purchaseOrderId}' while in status '${currentStatus}'.`,
    );
  }
}

export class EmptyPurchaseOrderError extends PurchasingDomainError {
  constructor(purchaseOrderId: string, operation: string) {
    super(`Cannot execute '${operation}' on empty purchase order '${purchaseOrderId}'.`);
  }
}

export class PurchaseOrderLineNotFoundError extends PurchasingDomainError {
  constructor(purchaseOrderId: string, productId: string) {
    super(`Product '${productId}' was not found in purchase order '${purchaseOrderId}'.`);
  }
}

export class OverReceivingNotAllowedError extends PurchasingDomainError {
  constructor(productId: string, remaining: number, attempted: number) {
    super(
      `Cannot receive ${attempted} units for product '${productId}'; only ${remaining} units remain on the purchase order.`,
    );
  }
}

export class PurchaseReceiptNotFoundError extends PurchasingDomainError {
  constructor(receiptId: string) {
    super(`Purchase receipt '${receiptId}' was not found.`);
  }
}

export class DuplicateInvoiceNumberError extends PurchasingDomainError {
  constructor(supplierId: string, invoiceNumber: string) {
    super(`Invoice '${invoiceNumber}' has already been recorded for supplier '${supplierId}'.`);
  }
}

export class SupplierPayableNotFoundError extends PurchasingDomainError {
  constructor(payableId: string) {
    super(`Supplier payable '${payableId}' was not found.`);
  }
}

export class InvalidPaymentAmountError extends PurchasingDomainError {
  constructor(amountCents: number, balanceCents: number) {
    super(
      `Payment amount (${amountCents} cents) is invalid for remaining balance (${balanceCents} cents).`,
    );
  }
}

export class CreditLimitExceededError extends PurchasingDomainError {
  constructor(supplierId: string, limitCents: number, projectedCents: number) {
    super(
      `Supplier '${supplierId}' credit limit (${limitCents} cents) would be exceeded (projected: ${projectedCents} cents).`,
    );
  }
}

export class PurchasingCurrencyMismatchError extends PurchasingDomainError {
  constructor(expected: string, received: string) {
    super(`Currency mismatch: expected '${expected}', received '${received}'.`);
  }
}
