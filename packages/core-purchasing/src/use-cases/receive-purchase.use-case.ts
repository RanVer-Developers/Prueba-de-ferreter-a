import { generateId } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemPurchasingClock,
  type ICatalogCostUpdaterPort,
  type IInventoryReceivingPort,
  type IPurchasingClock,
  type IPurchasingEventBus,
} from '../contracts/purchasing-contracts.js';
import {
  CreditLimitExceededError,
  DuplicateInvoiceNumberError,
  InvalidPurchaseOrderStateError,
  InvalidPurchasingInputError,
  OverReceivingNotAllowedError,
  PurchaseOrderLineNotFoundError,
  PurchaseOrderNotFoundError,
  PurchasingCurrencyMismatchError,
  SupplierInactiveError,
  SupplierNotFoundError,
} from '../domain/errors/purchasing-errors.js';
import {
  assertPurchasingFeatureEnabled,
  resolvePurchasingFeatures,
  type CostUpdateStrategy,
  type PurchasingFeatureProfile,
} from '../domain/services/purchasing-features.js';
import {
  calculatePurchasingLineTotals,
  sumDocumentTotals,
} from '../domain/services/purchasing-pricing.service.js';
import type { IPurchaseOrderRepository } from '../repositories/purchase-order-repository.interface.js';
import type { IPurchaseReceiptRepository } from '../repositories/purchase-receipt-repository.interface.js';
import type { ISupplierPayableRepository } from '../repositories/supplier-payable-repository.interface.js';
import type { ISupplierProductRepository } from '../repositories/supplier-product-repository.interface.js';
import type { ISupplierRepository } from '../repositories/supplier-repository.interface.js';
import {
  PURCHASING_SCHEMA_VERSION,
  PurchaseReceiptSchema,
  SupplierPayableSchema,
  type PurchaseOrder,
  type PurchaseReceipt,
  type PurchaseReceiptLine,
  type SupplierPayable,
} from '../schemas/purchasing.schemas.js';

export const ReceivePurchaseLineInputSchema = z.object({
  purchaseOrderLineId: z.string().min(1).optional(),
  productId: z.string().min(1),
  description: z.string().min(1),
  purchaseUom: z.string().min(1).default('UNIT'),
  packSize: z.number().positive().default(1),
  acceptedQuantity: z.number().nonnegative(),
  rejectedQuantity: z.number().nonnegative().default(0),
  unitCostCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(100_000).default(0),
  lotNumber: z.string().min(1).optional(),
  expirationDate: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
});

export const ReceivePurchaseInputSchema = z.object({
  id: z.string().min(1).optional(),
  receiptNumber: z.string().min(1).optional(),
  purchaseOrderId: z.string().min(1).optional(),
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  invoiceNumber: z.string().min(1).optional(),
  currency: z.string().min(3).max(3).optional(),
  lines: z.array(ReceivePurchaseLineInputSchema).min(1),
  receivedBy: z.string().min(1).optional(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});
export type ReceivePurchaseInput = z.input<typeof ReceivePurchaseInputSchema>;

export interface ReceivePurchaseResult {
  receipt: PurchaseReceipt;
  purchaseOrder: PurchaseOrder | null;
  payable: SupplierPayable | null;
}

export interface ReceivePurchaseDeps {
  supplierRepository: ISupplierRepository;
  supplierProductRepository?: ISupplierProductRepository;
  purchaseOrderRepository: IPurchaseOrderRepository;
  purchaseReceiptRepository: IPurchaseReceiptRepository;
  supplierPayableRepository?: ISupplierPayableRepository;
  inventoryReceivingPort?: IInventoryReceivingPort;
  catalogCostUpdaterPort?: ICatalogCostUpdaterPort;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
  featureProfile?: PurchasingFeatureProfile;
  costUpdateStrategy?: CostUpdateStrategy;
}

export async function receivePurchase(
  rawInput: ReceivePurchaseInput,
  deps: ReceivePurchaseDeps,
): Promise<ReceivePurchaseResult> {
  const parsed = ReceivePurchaseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid purchase receipt input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const data = parsed.data;
  const features = resolvePurchasingFeatures(deps.featureProfile);
  const costStrategy: CostUpdateStrategy = deps.costUpdateStrategy ?? 'LAST_COST';
  const nowDate = (deps.clock ?? new SystemPurchasingClock()).now();
  const now = nowDate.toISOString();
  const receivedAt = data.receivedAt ?? now;

  const supplier = await deps.supplierRepository.findById(data.supplierId);
  if (!supplier) {
    throw new SupplierNotFoundError(data.supplierId);
  }
  if (supplier.status !== 'ACTIVE') {
    throw new SupplierInactiveError(supplier.id, supplier.status);
  }

  const currency = (data.currency ?? supplier.currency).toUpperCase();
  if (currency !== supplier.currency) {
    throw new PurchasingCurrencyMismatchError(supplier.currency, currency);
  }

  if (data.invoiceNumber) {
    const duplicate = await deps.purchaseReceiptRepository.findByInvoiceNumber(
      supplier.id,
      data.invoiceNumber,
    );
    if (duplicate) {
      throw new DuplicateInvoiceNumberError(supplier.id, data.invoiceNumber);
    }
  }

  let purchaseOrder: PurchaseOrder | null = null;
  if (data.purchaseOrderId) {
    purchaseOrder = await deps.purchaseOrderRepository.findById(data.purchaseOrderId);
    if (!purchaseOrder) {
      throw new PurchaseOrderNotFoundError(data.purchaseOrderId);
    }
    if (purchaseOrder.supplierId !== supplier.id) {
      throw new InvalidPurchasingInputError(
        `Purchase order '${purchaseOrder.id}' belongs to supplier '${purchaseOrder.supplierId}', not '${supplier.id}'.`,
      );
    }
    if (purchaseOrder.currency !== currency) {
      throw new PurchasingCurrencyMismatchError(purchaseOrder.currency, currency);
    }
    if (purchaseOrder.status !== 'SENT' && purchaseOrder.status !== 'PARTIALLY_RECEIVED') {
      throw new InvalidPurchaseOrderStateError(purchaseOrder.id, purchaseOrder.status, 'receive');
    }
  } else {
    assertPurchasingFeatureEnabled(features, 'directPurchaseWithoutPO');
  }

  const hasAnyAccepted = data.lines.some((l) => l.acceptedQuantity > 0);
  if (!hasAnyAccepted && data.lines.every((l) => l.rejectedQuantity === 0)) {
    throw new InvalidPurchasingInputError(
      'At least one receipt line must have acceptedQuantity > 0 or rejectedQuantity > 0.',
    );
  }

  // Validate against PO lines and compute exact cents
  const updatedPoLines = purchaseOrder ? purchaseOrder.lines.map((l) => ({ ...l })) : null;
  const receiptLines: PurchaseReceiptLine[] = data.lines.map((lineInput) => {
    if (
      !features.fractionalQuantities &&
      (!Number.isInteger(lineInput.acceptedQuantity) ||
        !Number.isInteger(lineInput.rejectedQuantity))
    ) {
      throw new InvalidPurchasingInputError(
        `Fractional quantities are disabled in the current profile.`,
      );
    }

    if (purchaseOrder && updatedPoLines) {
      const poLine = lineInput.purchaseOrderLineId
        ? updatedPoLines.find((l) => l.id === lineInput.purchaseOrderLineId)
        : updatedPoLines.find((l) => l.productId === lineInput.productId);

      if (!poLine) {
        throw new PurchaseOrderLineNotFoundError(purchaseOrder.id, lineInput.productId);
      }

      const remaining = poLine.orderedQuantity - poLine.receivedQuantity;
      if (!features.allowOverReceiving && lineInput.acceptedQuantity > remaining) {
        throw new OverReceivingNotAllowedError(
          lineInput.productId,
          Math.max(0, remaining),
          lineInput.acceptedQuantity,
        );
      }
      poLine.receivedQuantity += lineInput.acceptedQuantity;
    }

    const calc = calculatePurchasingLineTotals({
      quantity: lineInput.acceptedQuantity,
      packSize: lineInput.packSize,
      unitCostCents: lineInput.unitCostCents,
      discountCents: lineInput.discountCents,
      taxRateBps: lineInput.taxRateBps,
    });

    return {
      id: generateId('prl'),
      purchaseOrderLineId: lineInput.purchaseOrderLineId,
      productId: lineInput.productId,
      description: lineInput.description,
      purchaseUom: lineInput.purchaseUom,
      packSize: lineInput.packSize,
      acceptedQuantity: lineInput.acceptedQuantity,
      rejectedQuantity: lineInput.rejectedQuantity,
      baseUnitsReceived: calc.baseUnits,
      unitCostCents: lineInput.unitCostCents,
      baseUnitCostCents: calc.baseUnitCostCents,
      discountCents: calc.discountCents,
      taxRateBps: lineInput.taxRateBps,
      lineSubtotalCents: calc.lineSubtotalCents,
      lineTaxCents: calc.lineTaxCents,
      lineTotalCents: calc.lineTotalCents,
      lotNumber: lineInput.lotNumber,
      expirationDate: lineInput.expirationDate,
      rejectionReason: lineInput.rejectionReason,
    };
  });

  const totals = sumDocumentTotals(receiptLines);
  const receiptId = data.id ?? generateId('rec');
  const receiptNumber = data.receiptNumber ?? `REC-${receiptId.slice(-8).toUpperCase()}`;

  // Check credit limit before persisting if payable will be created
  const willCreatePayable =
    features.accountsPayable && supplier.paymentTerms === 'CREDIT' && totals.totalCents > 0;

  if (
    willCreatePayable &&
    features.enforceCreditLimit &&
    !supplier.unlimitedCredit &&
    deps.supplierPayableRepository
  ) {
    const openBalance = await deps.supplierPayableRepository.getOpenBalanceCentsBySupplier(
      supplier.id,
    );
    const projectedBalance = openBalance + totals.totalCents;
    if (projectedBalance > supplier.creditLimitCents) {
      throw new CreditLimitExceededError(
        supplier.id,
        supplier.creditLimitCents,
        projectedBalance,
      );
    }
  }

  const receipt = PurchaseReceiptSchema.parse({
    schemaVersion: PURCHASING_SCHEMA_VERSION,
    id: receiptId,
    receiptNumber,
    purchaseOrderId: purchaseOrder?.id,
    supplierId: supplier.id,
    warehouseId: data.warehouseId,
    invoiceNumber: data.invoiceNumber,
    currency,
    lines: receiptLines,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    receivedBy: data.receivedBy,
    notes: data.notes,
    receivedAt,
    createdAt: now,
  });

  await deps.purchaseReceiptRepository.save(receipt);

  // Update PO status if linked
  let updatedOrder: PurchaseOrder | null = null;
  if (purchaseOrder && updatedPoLines) {
    const allReceived = updatedPoLines.every((l) => l.receivedQuantity >= l.orderedQuantity);
    updatedOrder = {
      ...purchaseOrder,
      lines: updatedPoLines,
      status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
      updatedAt: now,
    };
    await deps.purchaseOrderRepository.save(updatedOrder);
  }

  // Forward accepted goods to core-inventory via decoupled port
  const acceptedLines = receipt.lines.filter((l) => l.baseUnitsReceived > 0);
  if (acceptedLines.length > 0 && deps.inventoryReceivingPort) {
    await deps.inventoryReceivingPort.receivePurchaseStock({
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      purchaseOrderId: receipt.purchaseOrderId,
      supplierId: receipt.supplierId,
      warehouseId: receipt.warehouseId,
      invoiceNumber: receipt.invoiceNumber,
      receivedBy: receipt.receivedBy,
      receivedAt: receipt.receivedAt,
      lines: acceptedLines.map((l) => ({
        productId: l.productId,
        quantity: l.baseUnitsReceived,
        unitCostCents: l.baseUnitCostCents,
        currency: receipt.currency,
        lotNumber: l.lotNumber,
        expirationDate: l.expirationDate,
      })),
    });
  }

  // Update supplier-product cost & notify core-catalog via decoupled port
  for (const line of acceptedLines) {
    let previousCostCents: number | undefined;

    if (deps.supplierProductRepository) {
      const existingLink = await deps.supplierProductRepository.findBySupplierAndProduct(
        supplier.id,
        line.productId,
      );
      if (existingLink) {
        previousCostCents = existingLink.lastUnitCostCents;
        await deps.supplierProductRepository.save({
          ...existingLink,
          lastUnitCostCents: line.unitCostCents,
          updatedAt: now,
        });
      }
    }

    if (features.autoUpdateCatalogCost && costStrategy !== 'NONE' && deps.catalogCostUpdaterPort) {
      await deps.catalogCostUpdaterPort.updateProductCost({
        productId: line.productId,
        supplierId: supplier.id,
        newUnitCostCents: line.baseUnitCostCents,
        receivedBaseUnits: line.baseUnitsReceived,
        currency: receipt.currency,
        strategy: costStrategy,
        receiptId: receipt.id,
        updatedAt: now,
      });
    }

    if (previousCostCents !== line.unitCostCents) {
      await deps.eventBus?.publish({
        type: 'SupplierCostUpdated',
        supplierId: supplier.id,
        productId: line.productId,
        previousCostCents,
        newCostCents: line.unitCostCents,
        currency: receipt.currency,
        occurredAt: now,
      });
    }
  }

  // Create Accounts Payable record if credit supplier
  let payable: SupplierPayable | null = null;
  if (willCreatePayable && deps.supplierPayableRepository) {
    const dueDate = new Date(nowDate.getTime() + supplier.creditDays * 86_400_000).toISOString();
    payable = SupplierPayableSchema.parse({
      schemaVersion: PURCHASING_SCHEMA_VERSION,
      id: generateId('pay'),
      supplierId: supplier.id,
      receiptId: receipt.id,
      purchaseOrderId: receipt.purchaseOrderId,
      invoiceNumber: receipt.invoiceNumber,
      currency: receipt.currency,
      originalAmountCents: receipt.totalCents,
      paidAmountCents: 0,
      balanceCents: receipt.totalCents,
      status: 'OPEN',
      dueAt: dueDate,
      payments: [],
      createdAt: now,
      updatedAt: now,
    });
    await deps.supplierPayableRepository.save(payable);

    await deps.eventBus?.publish({
      type: 'SupplierPayableCreated',
      payableId: payable.id,
      supplierId: supplier.id,
      receiptId: receipt.id,
      amountCents: payable.originalAmountCents,
      dueAt: payable.dueAt,
      occurredAt: now,
    });
  }

  await deps.eventBus?.publish({
    type: 'PurchaseReceived',
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    purchaseOrderId: receipt.purchaseOrderId,
    supplierId: receipt.supplierId,
    warehouseId: receipt.warehouseId,
    totalCents: receipt.totalCents,
    occurredAt: now,
  });

  return {
    receipt,
    purchaseOrder: updatedOrder,
    payable,
  };
}
