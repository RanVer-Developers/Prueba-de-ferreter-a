import { generateId } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemPurchasingClock,
  type IPurchasingClock,
  type IPurchasingEventBus,
} from '../contracts/purchasing-contracts.js';
import {
  EmptyPurchaseOrderError,
  InvalidPurchaseOrderStateError,
  InvalidPurchasingInputError,
  PurchaseOrderNotFoundError,
  PurchasingCurrencyMismatchError,
  SupplierInactiveError,
  SupplierNotFoundError,
} from '../domain/errors/purchasing-errors.js';
import {
  resolvePurchasingFeatures,
  type PurchasingFeatureProfile,
} from '../domain/services/purchasing-features.js';
import {
  calculatePurchasingLineTotals,
  sumDocumentTotals,
} from '../domain/services/purchasing-pricing.service.js';
import type { IPurchaseOrderRepository } from '../repositories/purchase-order-repository.interface.js';
import type { ISupplierRepository } from '../repositories/supplier-repository.interface.js';
import {
  PURCHASING_SCHEMA_VERSION,
  PurchaseOrderSchema,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '../schemas/purchasing.schemas.js';

export const PurchaseOrderLineInputSchema = z.object({
  id: z.string().min(1).optional(),
  productId: z.string().min(1),
  supplierSku: z.string().min(1).optional(),
  description: z.string().min(1),
  purchaseUom: z.string().min(1).default('UNIT'),
  packSize: z.number().positive().default(1),
  orderedQuantity: z.number().positive(),
  unitCostCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(100_000).default(0),
});

export const CreatePurchaseOrderInputSchema = z.object({
  id: z.string().min(1).optional(),
  orderNumber: z.string().min(1).optional(),
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  currency: z.string().min(3).max(3).optional(),
  lines: z.array(PurchaseOrderLineInputSchema).min(1),
  expectedDeliveryAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  createdBy: z.string().min(1).optional(),
  /** If true and approval is not required, immediately marks the PO as SENT */
  autoSend: z.boolean().default(false),
});
export type CreatePurchaseOrderInput = z.input<typeof CreatePurchaseOrderInputSchema>;

export interface ManagePurchaseOrderDeps {
  supplierRepository: ISupplierRepository;
  purchaseOrderRepository: IPurchaseOrderRepository;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
  featureProfile?: PurchasingFeatureProfile;
}

export async function createPurchaseOrder(
  rawInput: CreatePurchaseOrderInput,
  deps: ManagePurchaseOrderDeps,
): Promise<PurchaseOrder> {
  const parsed = CreatePurchaseOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid purchase order input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const data = parsed.data;
  const features = resolvePurchasingFeatures(deps.featureProfile);

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

  const lines: PurchaseOrderLine[] = data.lines.map((lineInput) => {
    if (!features.fractionalQuantities && !Number.isInteger(lineInput.orderedQuantity)) {
      throw new InvalidPurchasingInputError(
        `Fractional quantity (${lineInput.orderedQuantity}) is disabled in the current profile.`,
      );
    }
    const calc = calculatePurchasingLineTotals({
      quantity: lineInput.orderedQuantity,
      packSize: lineInput.packSize,
      unitCostCents: lineInput.unitCostCents,
      discountCents: lineInput.discountCents,
      taxRateBps: lineInput.taxRateBps,
    });

    return {
      id: lineInput.id ?? generateId('pol'),
      productId: lineInput.productId,
      supplierSku: lineInput.supplierSku,
      description: lineInput.description,
      purchaseUom: lineInput.purchaseUom,
      packSize: lineInput.packSize,
      orderedQuantity: lineInput.orderedQuantity,
      receivedQuantity: 0,
      unitCostCents: lineInput.unitCostCents,
      discountCents: lineInput.discountCents,
      taxRateBps: lineInput.taxRateBps,
      lineSubtotalCents: calc.lineSubtotalCents,
      lineTaxCents: calc.lineTaxCents,
      lineTotalCents: calc.lineTotalCents,
    };
  });

  const totals = sumDocumentTotals(lines);
  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const id = data.id ?? generateId('po');
  const orderNumber = data.orderNumber ?? `PO-${id.slice(-8).toUpperCase()}`;

  const initialStatus =
    data.autoSend && !features.requirePOApproval ? 'SENT' : 'DRAFT';

  const order = PurchaseOrderSchema.parse({
    schemaVersion: PURCHASING_SCHEMA_VERSION,
    id,
    orderNumber,
    supplierId: supplier.id,
    warehouseId: data.warehouseId,
    currency,
    status: initialStatus,
    lines,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    expectedDeliveryAt: data.expectedDeliveryAt,
    notes: data.notes,
    createdBy: data.createdBy,
    sentAt: initialStatus === 'SENT' ? now : undefined,
    createdAt: now,
    updatedAt: now,
  });

  await deps.purchaseOrderRepository.save(order);
  await deps.eventBus?.publish({
    type: 'PurchaseOrderCreated',
    purchaseOrderId: order.id,
    orderNumber: order.orderNumber,
    supplierId: order.supplierId,
    totalCents: order.totalCents,
    occurredAt: now,
  });

  return order;
}

export async function approvePurchaseOrder(
  input: { purchaseOrderId: string; approvedBy?: string },
  deps: Pick<ManagePurchaseOrderDeps, 'purchaseOrderRepository' | 'eventBus' | 'clock'>,
): Promise<PurchaseOrder> {
  const order = await deps.purchaseOrderRepository.findById(input.purchaseOrderId);
  if (!order) {
    throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
  }
  if (order.status !== 'DRAFT') {
    throw new InvalidPurchaseOrderStateError(order.id, order.status, 'approve');
  }
  if (order.lines.length === 0) {
    throw new EmptyPurchaseOrderError(order.id, 'approve');
  }

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const updated: PurchaseOrder = {
    ...order,
    status: 'APPROVED',
    approvedBy: input.approvedBy,
    approvedAt: now,
    updatedAt: now,
  };

  await deps.purchaseOrderRepository.save(updated);
  await deps.eventBus?.publish({
    type: 'PurchaseOrderApproved',
    purchaseOrderId: updated.id,
    approvedBy: input.approvedBy,
    occurredAt: now,
  });

  return updated;
}

export async function sendPurchaseOrder(
  input: { purchaseOrderId: string },
  deps: Pick<
    ManagePurchaseOrderDeps,
    'purchaseOrderRepository' | 'eventBus' | 'clock' | 'featureProfile'
  >,
): Promise<PurchaseOrder> {
  const order = await deps.purchaseOrderRepository.findById(input.purchaseOrderId);
  if (!order) {
    throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
  }

  const features = resolvePurchasingFeatures(deps.featureProfile);
  const allowedStatuses = features.requirePOApproval ? ['APPROVED'] : ['DRAFT', 'APPROVED'];

  if (!allowedStatuses.includes(order.status)) {
    throw new InvalidPurchaseOrderStateError(order.id, order.status, 'send');
  }
  if (order.lines.length === 0) {
    throw new EmptyPurchaseOrderError(order.id, 'send');
  }

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const updated: PurchaseOrder = {
    ...order,
    status: 'SENT',
    sentAt: now,
    updatedAt: now,
  };

  await deps.purchaseOrderRepository.save(updated);
  await deps.eventBus?.publish({
    type: 'PurchaseOrderSent',
    purchaseOrderId: updated.id,
    occurredAt: now,
  });

  return updated;
}

export async function cancelPurchaseOrder(
  input: { purchaseOrderId: string; reason?: string },
  deps: Pick<ManagePurchaseOrderDeps, 'purchaseOrderRepository' | 'eventBus' | 'clock'>,
): Promise<PurchaseOrder> {
  const order = await deps.purchaseOrderRepository.findById(input.purchaseOrderId);
  if (!order) {
    throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
  }
  if (
    order.status === 'RECEIVED' ||
    order.status === 'PARTIALLY_RECEIVED' ||
    order.status === 'CANCELLED'
  ) {
    throw new InvalidPurchaseOrderStateError(order.id, order.status, 'cancel');
  }

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const updated: PurchaseOrder = {
    ...order,
    status: 'CANCELLED',
    cancelledAt: now,
    cancellationReason: input.reason,
    updatedAt: now,
  };

  await deps.purchaseOrderRepository.save(updated);
  await deps.eventBus?.publish({
    type: 'PurchaseOrderCancelled',
    purchaseOrderId: updated.id,
    reason: input.reason,
    occurredAt: now,
  });

  return updated;
}
