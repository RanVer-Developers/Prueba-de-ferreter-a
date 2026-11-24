import {
  ICatalogCostUpdaterPort,
  IInventoryReceivingPort,
  IInventoryReturnPort,
  IPurchasingClock,
  IPurchasingEventBus,
  SystemPurchasingClock,
} from './contracts/purchasing-contracts.js';
import {
  PurchasingFeatureFlags,
  PurchasingFeatureProfile,
  resolvePurchasingFeatures,
} from './domain/services/purchasing-features.js';
import {
  InMemoryPurchaseOrderRepository,
  InMemoryPurchaseReceiptRepository,
  InMemorySupplierPayableRepository,
  InMemorySupplierProductRepository,
  InMemorySupplierRepository,
  InMemorySupplierReturnRepository,
} from './repositories/in-memory/in-memory-purchasing-repositories.js';
import type { IPurchaseOrderRepository } from './repositories/purchase-order-repository.interface.js';
import type { IPurchaseReceiptRepository } from './repositories/purchase-receipt-repository.interface.js';
import type {
  ISupplierPayableRepository,
  ISupplierReturnRepository,
} from './repositories/supplier-payable-repository.interface.js';
import type { ISupplierProductRepository } from './repositories/supplier-product-repository.interface.js';
import type { ISupplierRepository } from './repositories/supplier-repository.interface.js';
import {
  AllocateMultiDocSupplierPaymentInput,
  allocateMultiDocumentSupplierPayment,
} from './use-cases/allocate-multi-doc-payment.use-case.js';
import {
  LinkSupplierProductInput,
  linkSupplierProduct,
} from './use-cases/link-supplier-product.use-case.js';
import {
  CreatePurchaseOrderInput,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  sendPurchaseOrder,
} from './use-cases/manage-purchase-order.use-case.js';
import {
  CreateSupplierInput,
  UpdateSupplierInput,
  UpsertSupplierAddressInput,
  createSupplier,
  removeSupplierAddress,
  updateSupplier,
  upsertSupplierAddress,
} from './use-cases/manage-supplier.use-case.js';
import { ReceivePurchaseInput, receivePurchase } from './use-cases/receive-purchase.use-case.js';
import {
  RecordSupplierPaymentInput,
  recordSupplierPayment,
} from './use-cases/record-supplier-payment.use-case.js';
import {
  RecordSupplierReturnInput,
  recordSupplierReturn,
} from './use-cases/record-supplier-return.use-case.js';

export interface PurchasingModuleDeps {
  supplierRepository?: ISupplierRepository;
  supplierProductRepository?: ISupplierProductRepository;
  purchaseOrderRepository?: IPurchaseOrderRepository;
  purchaseReceiptRepository?: IPurchaseReceiptRepository;
  supplierPayableRepository?: ISupplierPayableRepository;
  supplierReturnRepository?: ISupplierReturnRepository;
  inventoryReceivingPort?: IInventoryReceivingPort;
  inventoryReturnPort?: IInventoryReturnPort;
  catalogCostUpdaterPort?: ICatalogCostUpdaterPort;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
  featureProfile?: PurchasingFeatureProfile;
}

export function createPurchasingModule(deps: PurchasingModuleDeps = {}) {
  const supplierRepository = deps.supplierRepository ?? new InMemorySupplierRepository();
  const supplierProductRepository =
    deps.supplierProductRepository ?? new InMemorySupplierProductRepository();
  const purchaseOrderRepository =
    deps.purchaseOrderRepository ?? new InMemoryPurchaseOrderRepository();
  const purchaseReceiptRepository =
    deps.purchaseReceiptRepository ?? new InMemoryPurchaseReceiptRepository();
  const supplierPayableRepository =
    deps.supplierPayableRepository ?? new InMemorySupplierPayableRepository();
  const supplierReturnRepository =
    deps.supplierReturnRepository ?? new InMemorySupplierReturnRepository();
  const clock = deps.clock ?? new SystemPurchasingClock();
  const features: PurchasingFeatureFlags = resolvePurchasingFeatures(deps.featureProfile);

  const supplierDeps = {
    supplierRepository,
    eventBus: deps.eventBus,
    clock,
    featureProfile: features,
  };
  const poDeps = {
    supplierRepository,
    purchaseOrderRepository,
    eventBus: deps.eventBus,
    clock,
    featureProfile: features,
  };

  return {
    features,
    repositories: {
      supplierRepository,
      supplierProductRepository,
      purchaseOrderRepository,
      purchaseReceiptRepository,
      supplierPayableRepository,
      supplierReturnRepository,
    },
    createSupplier: (input: CreateSupplierInput) => createSupplier(input, supplierDeps),
    updateSupplier: (input: UpdateSupplierInput) => updateSupplier(input, supplierDeps),
    upsertSupplierAddress: (input: UpsertSupplierAddressInput) =>
      upsertSupplierAddress(input, supplierDeps),
    removeSupplierAddress: (supplierId: string, addressId: string) =>
      removeSupplierAddress(supplierId, addressId, supplierDeps),
    linkSupplierProduct: (input: LinkSupplierProductInput) =>
      linkSupplierProduct(input, {
        supplierRepository,
        supplierProductRepository,
        clock,
      }),
    createPurchaseOrder: (input: CreatePurchaseOrderInput) => createPurchaseOrder(input, poDeps),
    approvePurchaseOrder: (input: { purchaseOrderId: string; approvedBy?: string }) =>
      approvePurchaseOrder(input, poDeps),
    sendPurchaseOrder: (input: { purchaseOrderId: string }) => sendPurchaseOrder(input, poDeps),
    cancelPurchaseOrder: (input: { purchaseOrderId: string; reason?: string }) =>
      cancelPurchaseOrder(input, poDeps),
    receivePurchase: (input: ReceivePurchaseInput) =>
      receivePurchase(input, {
        supplierRepository,
        purchaseOrderRepository,
        purchaseReceiptRepository,
        supplierPayableRepository,
        supplierProductRepository,
        inventoryReceivingPort: deps.inventoryReceivingPort,
        catalogCostUpdaterPort: deps.catalogCostUpdaterPort,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    recordSupplierReturn: (input: RecordSupplierReturnInput) =>
      recordSupplierReturn(input, {
        supplierRepository,
        supplierReturnRepository,
        inventoryReturnPort: deps.inventoryReturnPort,
        eventBus: deps.eventBus,
        clock,
      }),
    recordSupplierPayment: (input: RecordSupplierPaymentInput) =>
      recordSupplierPayment(input, {
        supplierPayableRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    allocateMultiDocumentPayment: (input: AllocateMultiDocSupplierPaymentInput) =>
      allocateMultiDocumentSupplierPayment(input, {
        supplierPayableRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
  };
}

export type PurchasingModule = ReturnType<typeof createPurchasingModule>;
