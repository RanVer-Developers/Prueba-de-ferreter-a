// Schemas & Types
export {
  PURCHASING_SCHEMA_VERSION,
  PurchasingSchemaVersionSchema,
  CentsSchema,
  PositiveQuantitySchema,
  NonNegativeQuantitySchema,
  BasisPointsSchema,
  SupplierStatusSchema,
  PaymentTermsTypeSchema,
  SupplierAddressKindSchema,
  SupplierAddressSchema,
  SupplierSchema,
  SupplierProductSchema,
  PurchaseOrderStatusSchema,
  PurchaseOrderLineSchema,
  PurchaseOrderSchema,
  PurchaseReceiptLineSchema,
  PurchaseReceiptSchema,
  PayableStatusSchema,
  SupplierPaymentRecordSchema,
  SupplierPayableSchema,
  SupplierReturnLineSchema,
  SupplierReturnSchema,
  type SupplierStatus,
  type PaymentTermsType,
  type SupplierAddressKind,
  type SupplierAddress,
  type Supplier,
  type SupplierProduct,
  type PurchaseOrderStatus,
  type PurchaseOrderLine,
  type PurchaseOrder,
  type PurchaseReceiptLine,
  type PurchaseReceipt,
  type PayableStatus,
  type SupplierPaymentRecord,
  type SupplierPayable,
  type SupplierReturnLine,
  type SupplierReturn,
} from './schemas/purchasing.schemas.js';

// Domain Errors
export {
  PurchasingDomainError,
  InvalidPurchasingInputError,
  PurchasingFeatureDisabledError,
  SupplierNotFoundError,
  SupplierInactiveError,
  SupplierProductNotFoundError,
  PurchaseOrderNotFoundError,
  InvalidPurchaseOrderStateError,
  EmptyPurchaseOrderError,
  PurchaseOrderLineNotFoundError,
  OverReceivingNotAllowedError,
  PurchaseReceiptNotFoundError,
  DuplicateInvoiceNumberError,
  SupplierPayableNotFoundError,
  InvalidPaymentAmountError,
  CreditLimitExceededError,
  PurchasingCurrencyMismatchError,
} from './domain/errors/purchasing-errors.js';

// Domain Events
export type { PurchasingDomainEvent } from './domain/events/purchasing-events.js';

// Domain Services & Feature Flags
export {
  PURCHASING_TIER_PRESETS,
  resolvePurchasingFeatures,
  assertPurchasingFeatureEnabled,
  type PurchasingTier,
  type CostUpdateStrategy,
  type PurchasingFeature,
  type PurchasingFeatureFlags,
  type PurchasingFeatureProfile,
} from './domain/services/purchasing-features.js';

export {
  calculatePurchasingLineTotals,
  sumDocumentTotals,
  calculateWeightedAverageCostCents,
  type LineCostCalculationInput,
  type LineCostCalculationResult,
  type DocumentTotals,
} from './domain/services/purchasing-pricing.service.js';

// Contracts & Ports
export {
  SystemPurchasingClock,
  type InventoryReceivingLineInput,
  type InventoryReceivingPortInput,
  type IInventoryReceivingPort,
  type InventoryReturnLineInput,
  type InventoryReturnPortInput,
  type IInventoryReturnPort,
  type CatalogCostUpdateInput,
  type ICatalogCostUpdaterPort,
  type IPurchasingEventBus,
  type IPurchasingClock,
} from './contracts/purchasing-contracts.js';

// Repository Interfaces
export type { ISupplierRepository, SupplierFilter } from './repositories/supplier-repository.interface.js';
export type { ISupplierProductRepository } from './repositories/supplier-product-repository.interface.js';
export type {
  IPurchaseOrderRepository,
  PurchaseOrderFilter,
} from './repositories/purchase-order-repository.interface.js';
export type {
  IPurchaseReceiptRepository,
  PurchaseReceiptFilter,
} from './repositories/purchase-receipt-repository.interface.js';
export type {
  ISupplierPayableRepository,
  ISupplierReturnRepository,
  SupplierPayableFilter,
} from './repositories/supplier-payable-repository.interface.js';

// In-Memory Repositories
export {
  InMemorySupplierRepository,
  InMemorySupplierProductRepository,
  InMemoryPurchaseOrderRepository,
  InMemoryPurchaseReceiptRepository,
  InMemorySupplierPayableRepository,
  InMemorySupplierReturnRepository,
} from './repositories/in-memory/in-memory-purchasing-repositories.js';

// Use Cases
export {
  CreateSupplierInputSchema,
  UpdateSupplierInputSchema,
  UpsertSupplierAddressInputSchema,
  createSupplier,
  updateSupplier,
  upsertSupplierAddress,
  removeSupplierAddress,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type UpsertSupplierAddressInput,
  type ManageSupplierDeps,
} from './use-cases/manage-supplier.use-case.js';

export {
  LinkSupplierProductInputSchema,
  linkSupplierProduct,
  type LinkSupplierProductInput,
  type LinkSupplierProductDeps,
} from './use-cases/link-supplier-product.use-case.js';

export {
  PurchaseOrderLineInputSchema,
  CreatePurchaseOrderInputSchema,
  createPurchaseOrder,
  approvePurchaseOrder,
  sendPurchaseOrder,
  cancelPurchaseOrder,
  type CreatePurchaseOrderInput,
  type ManagePurchaseOrderDeps,
} from './use-cases/manage-purchase-order.use-case.js';

export {
  ReceivePurchaseLineInputSchema,
  ReceivePurchaseInputSchema,
  receivePurchase,
  type ReceivePurchaseInput,
  type ReceivePurchaseResult,
  type ReceivePurchaseDeps,
} from './use-cases/receive-purchase.use-case.js';

export {
  SupplierReturnLineInputSchema,
  RecordSupplierReturnInputSchema,
  recordSupplierReturn,
  type RecordSupplierReturnInput,
  type RecordSupplierReturnDeps,
} from './use-cases/record-supplier-return.use-case.js';

export {
  RecordSupplierPaymentInputSchema,
  recordSupplierPayment,
  type RecordSupplierPaymentInput,
  type RecordSupplierPaymentDeps,
} from './use-cases/record-supplier-payment.use-case.js';

export {
  PayableAllocationLineSchema,
  AllocateMultiDocSupplierPaymentInputSchema,
  allocateMultiDocumentSupplierPayment,
  type AllocateMultiDocSupplierPaymentInput,
  type MultiDocPaymentAllocationSummary,
  type AllocateMultiDocSupplierPaymentResult,
  type AllocateMultiDocSupplierPaymentDeps,
} from './use-cases/allocate-multi-doc-payment.use-case.js';
export * from './purchasing-module.js';
