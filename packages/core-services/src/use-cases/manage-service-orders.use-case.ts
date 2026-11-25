import { generateId, IsoCurrencyCodeSchema, NonEmptyStringSchema } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemServicesClock,
  type IServiceBillingPort,
  type IServiceInventoryPort,
  type IServicesClock,
  type IServicesEventBus,
} from '../contracts/service-contracts.js';
import {
  InvalidServiceOrderStateError,
  InvalidServicesInputError,
  ServiceOrderNotFoundError,
} from '../domain/errors/services-errors.js';
import {
  computeChargeLineAmounts,
  computeServiceOrderTotals,
} from '../domain/services/service-pricing.service.js';
import {
  assertServiceFeatureEnabled,
  resolveServicesFeatures,
  type ServicesFeatureProfile,
} from '../domain/services/services-features.js';
import type { IServiceOrderRepository } from '../repositories/service-order-repository.interface.js';
import {
  BasisPointsSchema,
  NonNegativeCentsSchema,
  PositiveQuantitySchema,
  SERVICES_SCHEMA_VERSION,
  ServiceAssetSchema,
  ServiceOrderSchema,
  ServiceOrderStatusSchema,
  ServiceOrderTypeSchema,
  type ServiceOrder,
  type ServiceOrderStatus,
} from '../schemas/services.schemas.js';

export const CreateServiceOrderInputSchema = z.object({
  id: NonEmptyStringSchema.optional(),
  orderNumber: NonEmptyStringSchema.optional(),
  type: ServiceOrderTypeSchema,
  branchId: NonEmptyStringSchema.optional(),
  customerId: NonEmptyStringSchema,
  assignedTechnicianId: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema.default('MXN'),
  asset: ServiceAssetSchema,
  reportedIssue: NonEmptyStringSchema,
  isUnderWarranty: z.boolean().default(false),
  warrantyDays: z.number().int().min(0).default(30),
  createdBy: NonEmptyStringSchema.optional(),
  idempotencyKey: NonEmptyStringSchema.optional(),
});
export type CreateServiceOrderInput = z.input<typeof CreateServiceOrderInputSchema>;

export const RecordDiagnosisInputSchema = z.object({
  serviceOrderId: NonEmptyStringSchema,
  diagnosisNotes: z.string().trim().min(1).max(1000),
  estimatedTotalCents: NonNegativeCentsSchema,
  technicianId: NonEmptyStringSchema.optional(),
});
export type RecordDiagnosisInput = z.input<typeof RecordDiagnosisInputSchema>;

export const ApproveServiceOrderInputSchema = z.object({
  serviceOrderId: NonEmptyStringSchema,
  approvedBy: NonEmptyStringSchema.optional(),
});
export type ApproveServiceOrderInput = z.input<typeof ApproveServiceOrderInputSchema>;

export const RecordServiceLaborInputSchema = z.object({
  serviceOrderId: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  technicianId: NonEmptyStringSchema.optional(),
  hours: PositiveQuantitySchema,
  hourlyRateCents: NonNegativeCentsSchema,
  taxRateBps: BasisPointsSchema.default(0),
  idempotencyKey: NonEmptyStringSchema.optional(),
});
export type RecordServiceLaborInput = z.input<typeof RecordServiceLaborInputSchema>;

export const ConsumeServicePartInputSchema = z.object({
  serviceOrderId: NonEmptyStringSchema,
  productId: NonEmptyStringSchema,
  sku: NonEmptyStringSchema.optional(),
  description: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  quantity: PositiveQuantitySchema,
  unitPriceCents: NonNegativeCentsSchema,
  unitCostCents: NonNegativeCentsSchema.default(0),
  taxRateBps: BasisPointsSchema.default(0),
  idempotencyKey: NonEmptyStringSchema.optional(),
});
export type ConsumeServicePartInput = z.input<typeof ConsumeServicePartInputSchema>;

export const TransitionServiceStatusInputSchema = z.object({
  serviceOrderId: NonEmptyStringSchema,
  targetStatus: ServiceOrderStatusSchema,
  changedBy: NonEmptyStringSchema.optional(),
  reason: z.string().trim().max(300).optional(),
});
export type TransitionServiceStatusInput = z.input<typeof TransitionServiceStatusInputSchema>;

export interface ServiceOrderDeps {
  serviceOrderRepository: IServiceOrderRepository;
  inventoryPort?: IServiceInventoryPort;
  billingPort?: IServiceBillingPort;
  eventBus?: IServicesEventBus;
  clock?: IServicesClock;
  featureProfile?: ServicesFeatureProfile;
}

function parseInput<T>(schema: z.ZodType<T>, raw: unknown, context: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new InvalidServicesInputError(`Invalid ${context}: ${detail}`);
  }
  return parsed.data;
}

const TRANSITIONS: Readonly<Record<ServiceOrderStatus, ReadonlyArray<ServiceOrderStatus>>> = {
  INTAKE: ['DIAGNOSIS', 'QUOTED', 'APPROVED', 'IN_PROGRESS', 'CANCELLED'],
  DIAGNOSIS: ['QUOTED', 'APPROVED', 'IN_PROGRESS', 'CANCELLED'],
  QUOTED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['QUALITY_CHECK', 'READY_FOR_PICKUP', 'CANCELLED'],
  QUALITY_CHECK: ['IN_PROGRESS', 'READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const WORKABLE_STATUSES: ReadonlySet<ServiceOrderStatus> = new Set([
  'APPROVED',
  'IN_PROGRESS',
  'QUALITY_CHECK',
]);

export async function createServiceOrder(
  rawInput: CreateServiceOrderInput,
  deps: ServiceOrderDeps,
): Promise<ServiceOrder> {
  const data = parseInput(CreateServiceOrderInputSchema, rawInput, 'create service order input');
  if (data.idempotencyKey) {
    const existing = await deps.serviceOrderRepository.findByIdempotencyKey(data.idempotencyKey);
    if (existing) return existing;
  }

  const features = resolveServicesFeatures(deps.featureProfile);
  if (data.assignedTechnicianId) {
    assertServiceFeatureEnabled(features, 'technicianAssignment');
  }

  const now = (deps.clock ?? new SystemServicesClock()).now().toISOString();
  const id = data.id ?? generateId('srv');
  const orderNumber = data.orderNumber ?? `SRV-${id.slice(-8).toUpperCase()}`;

  const order = ServiceOrderSchema.parse({
    schemaVersion: SERVICES_SCHEMA_VERSION,
    id,
    orderNumber,
    type: data.type,
    status: 'INTAKE',
    branchId: data.branchId,
    customerId: data.customerId,
    assignedTechnicianId: data.assignedTechnicianId,
    currency: data.currency,
    asset: data.asset,
    reportedIssue: data.reportedIssue,
    isUnderWarranty: data.isUnderWarranty,
    warrantyDays: features.warrantyTracking ? data.warrantyDays : 0,
    laborLines: [],
    partLines: [],
    laborSubtotalCents: 0,
    partsSubtotalCents: 0,
    taxTotalCents: 0,
    totalCents: 0,
    statusHistory: [
      {
        from: null,
        to: 'INTAKE',
        changedBy: data.createdBy,
        occurredAt: now,
      },
    ],
    processedIdempotencyKeys: data.idempotencyKey ? [data.idempotencyKey] : [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await deps.serviceOrderRepository.save(order);
  await deps.eventBus?.publish({
    type: 'ServiceOrderCreated',
    serviceOrderId: order.id,
    orderNumber: order.orderNumber,
    serviceType: order.type,
    customerId: order.customerId,
    occurredAt: now,
  });

  return order;
}

export async function recordServiceDiagnosisAndQuote(
  rawInput: RecordDiagnosisInput,
  deps: ServiceOrderDeps,
): Promise<ServiceOrder> {
  const data = parseInput(RecordDiagnosisInputSchema, rawInput, 'record service diagnosis input');
  const existing = await deps.serviceOrderRepository.findById(data.serviceOrderId);
  if (!existing) throw new ServiceOrderNotFoundError(data.serviceOrderId);

  if (existing.status !== 'INTAKE' && existing.status !== 'DIAGNOSIS') {
    throw new InvalidServiceOrderStateError(existing.id, existing.status, 'record diagnosis on');
  }

  const now = (deps.clock ?? new SystemServicesClock()).now().toISOString();
  const updated = ServiceOrderSchema.parse({
    ...existing,
    status: 'QUOTED',
    diagnosisNotes: data.diagnosisNotes,
    estimatedTotalCents: data.estimatedTotalCents,
    assignedTechnicianId: data.technicianId ?? existing.assignedTechnicianId,
    statusHistory: [
      ...existing.statusHistory,
      { from: existing.status, to: 'QUOTED', changedBy: data.technicianId, occurredAt: now },
    ],
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.serviceOrderRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'ServiceOrderQuoted',
    serviceOrderId: updated.id,
    estimatedTotalCents: data.estimatedTotalCents,
    occurredAt: now,
  });
  return updated;
}

export async function approveServiceOrder(
  rawInput: ApproveServiceOrderInput,
  deps: ServiceOrderDeps,
): Promise<ServiceOrder> {
  const data = parseInput(ApproveServiceOrderInputSchema, rawInput, 'approve service order input');
  const existing = await deps.serviceOrderRepository.findById(data.serviceOrderId);
  if (!existing) throw new ServiceOrderNotFoundError(data.serviceOrderId);

  if (existing.status !== 'QUOTED' && existing.status !== 'DIAGNOSIS' && existing.status !== 'INTAKE') {
    throw new InvalidServiceOrderStateError(existing.id, existing.status, 'approve');
  }

  const now = (deps.clock ?? new SystemServicesClock()).now().toISOString();
  const updated = ServiceOrderSchema.parse({
    ...existing,
    status: 'APPROVED',
    approvedAt: now,
    statusHistory: [
      ...existing.statusHistory,
      { from: existing.status, to: 'APPROVED', changedBy: data.approvedBy, occurredAt: now },
    ],
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.serviceOrderRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'ServiceOrderApproved',
    serviceOrderId: updated.id,
    approvedBy: data.approvedBy,
    occurredAt: now,
  });
  return updated;
}

export async function recordServiceLabor(
  rawInput: RecordServiceLaborInput,
  deps: ServiceOrderDeps,
): Promise<ServiceOrder> {
  const data = parseInput(RecordServiceLaborInputSchema, rawInput, 'record service labor input');
  const existing = await deps.serviceOrderRepository.findById(data.serviceOrderId);
  if (!existing) throw new ServiceOrderNotFoundError(data.serviceOrderId);

  if (data.idempotencyKey && existing.processedIdempotencyKeys.includes(data.idempotencyKey)) {
    return existing;
  }

  const features = resolveServicesFeatures(deps.featureProfile);
  if (features.requireDiagnosisApproval && !WORKABLE_STATUSES.has(existing.status)) {
    throw new InvalidServiceOrderStateError(existing.id, existing.status, 'record labor on');
  }
  if (!features.requireDiagnosisApproval && (existing.status === 'DELIVERED' || existing.status === 'CANCELLED')) {
    throw new InvalidServiceOrderStateError(existing.id, existing.status, 'record labor on');
  }

  const now = (deps.clock ?? new SystemServicesClock()).now().toISOString();
  const amounts = computeChargeLineAmounts(data.hours, data.hourlyRateCents, data.taxRateBps);
  const newLine = {
    id: generateId('slbr'),
    description: data.description,
    technicianId: data.technicianId ?? existing.assignedTechnicianId,
    hours: data.hours,
    hourlyRateCents: data.hourlyRateCents,
    taxRateBps: data.taxRateBps,
    subtotalCents: amounts.subtotalCents,
    taxCents: amounts.taxCents,
    totalCents: amounts.totalCents,
    performedAt: now,
  };

  const laborLines = [...existing.laborLines, newLine];
  const totals = computeServiceOrderTotals(laborLines, existing.partLines, existing.isUnderWarranty);
  const nextStatus: ServiceOrderStatus =
    existing.status === 'APPROVED' || existing.status === 'INTAKE' ? 'IN_PROGRESS' : existing.status;

  const updated = ServiceOrderSchema.parse({
    ...existing,
    status: nextStatus,
    laborLines,
    ...totals,
    statusHistory:
      nextStatus !== existing.status
        ? [
            ...existing.statusHistory,
            { from: existing.status, to: nextStatus, changedBy: data.technicianId, occurredAt: now },
          ]
        : existing.statusHistory,
    processedIdempotencyKeys: data.idempotencyKey
      ? [...existing.processedIdempotencyKeys, data.idempotencyKey]
      : existing.processedIdempotencyKeys,
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.serviceOrderRepository.save(updated, existing.version);
  return updated;
}

export async function consumeServicePart(
  rawInput: ConsumeServicePartInput,
  deps: ServiceOrderDeps,
): Promise<ServiceOrder> {
  const features = resolveServicesFeatures(deps.featureProfile);
  assertServiceFeatureEnabled(features, 'partsConsumption');

  const data = parseInput(ConsumeServicePartInputSchema, rawInput, 'consume service part input');
  const existing = await deps.serviceOrderRepository.findById(data.serviceOrderId);
  if (!existing) throw new ServiceOrderNotFoundError(data.serviceOrderId);

  if (data.idempotencyKey && existing.processedIdempotencyKeys.includes(data.idempotencyKey)) {
    return existing;
  }

  if (features.requireDiagnosisApproval && !WORKABLE_STATUSES.has(existing.status)) {
    throw new InvalidServiceOrderStateError(existing.id, existing.status, 'consume parts on');
  }
  if (!features.requireDiagnosisApproval && (existing.status === 'DELIVERED' || existing.status === 'CANCELLED')) {
    throw new InvalidServiceOrderStateError(existing.id, existing.status, 'consume parts on');
  }

  const now = (deps.clock ?? new SystemServicesClock()).now().toISOString();
  const amounts = computeChargeLineAmounts(data.quantity, data.unitPriceCents, data.taxRateBps);
  const newPart = {
    id: generateId('sprt'),
    productId: data.productId,
    sku: data.sku,
    description: data.description,
    warehouseId: data.warehouseId,
    quantity: data.quantity,
    unitPriceCents: data.unitPriceCents,
    unitCostCents: data.unitCostCents,
    taxRateBps: data.taxRateBps,
    subtotalCents: amounts.subtotalCents,
    taxCents: amounts.taxCents,
    totalCents: amounts.totalCents,
    consumedAt: now,
  };

  if (deps.inventoryPort) {
    await deps.inventoryPort.consumePartStock({
      serviceOrderId: existing.id,
      orderNumber: existing.orderNumber,
      warehouseId: data.warehouseId,
      productId: data.productId,
      quantity: data.quantity,
      unitCostCents: data.unitCostCents,
      occurredAt: now,
    });
  }

  const partLines = [...existing.partLines, newPart];
  const totals = computeServiceOrderTotals(existing.laborLines, partLines, existing.isUnderWarranty);
  const nextStatus: ServiceOrderStatus =
    existing.status === 'APPROVED' || existing.status === 'INTAKE' ? 'IN_PROGRESS' : existing.status;

  const updated = ServiceOrderSchema.parse({
    ...existing,
    status: nextStatus,
    partLines,
    ...totals,
    statusHistory:
      nextStatus !== existing.status
        ? [...existing.statusHistory, { from: existing.status, to: nextStatus, occurredAt: now }]
        : existing.statusHistory,
    processedIdempotencyKeys: data.idempotencyKey
      ? [...existing.processedIdempotencyKeys, data.idempotencyKey]
      : existing.processedIdempotencyKeys,
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.serviceOrderRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'ServicePartConsumed',
    serviceOrderId: updated.id,
    productId: data.productId,
    warehouseId: data.warehouseId,
    quantity: data.quantity,
    totalCents: amounts.totalCents,
    occurredAt: now,
  });
  return updated;
}

export async function transitionServiceOrderStatus(
  rawInput: TransitionServiceStatusInput,
  deps: ServiceOrderDeps,
): Promise<ServiceOrder> {
  const data = parseInput(
    TransitionServiceStatusInputSchema,
    rawInput,
    'transition service status input',
  );
  const existing = await deps.serviceOrderRepository.findById(data.serviceOrderId);
  if (!existing) throw new ServiceOrderNotFoundError(data.serviceOrderId);

  if (existing.status === data.targetStatus) return existing;

  const features = resolveServicesFeatures(deps.featureProfile);
  if (
    features.qualityCheckGate &&
    existing.status === 'IN_PROGRESS' &&
    data.targetStatus === 'READY_FOR_PICKUP'
  ) {
    throw new InvalidServiceOrderStateError(
      existing.id,
      existing.status,
      'skip QUALITY_CHECK before READY_FOR_PICKUP',
    );
  }

  const allowed = TRANSITIONS[existing.status];
  if (!allowed.includes(data.targetStatus)) {
    throw new InvalidServiceOrderStateError(
      existing.id,
      existing.status,
      `transition to ${data.targetStatus}`,
    );
  }

  const nowDate = (deps.clock ?? new SystemServicesClock()).now();
  const now = nowDate.toISOString();

  let warrantyExpiresAt = existing.warrantyExpiresAt;
  if (data.targetStatus === 'DELIVERED' && features.warrantyTracking && existing.warrantyDays > 0) {
    const exp = new Date(nowDate.getTime() + existing.warrantyDays * 86_400_000);
    warrantyExpiresAt = exp.toISOString();
  }

  const updated = ServiceOrderSchema.parse({
    ...existing,
    status: data.targetStatus,
    warrantyExpiresAt,
    deliveredAt: data.targetStatus === 'DELIVERED' ? now : existing.deliveredAt,
    cancelledAt: data.targetStatus === 'CANCELLED' ? now : existing.cancelledAt,
    statusHistory: [
      ...existing.statusHistory,
      {
        from: existing.status,
        to: data.targetStatus,
        changedBy: data.changedBy,
        reason: data.reason,
        occurredAt: now,
      },
    ],
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.serviceOrderRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'ServiceOrderStatusChanged',
    serviceOrderId: updated.id,
    previousStatus: existing.status,
    newStatus: updated.status,
    occurredAt: now,
  });

  if (updated.status === 'DELIVERED') {
    if (features.billingIntegration && deps.billingPort && updated.totalCents > 0) {
      await deps.billingPort.notifyServiceReadyForBilling({
        serviceOrderId: updated.id,
        orderNumber: updated.orderNumber,
        customerId: updated.customerId,
        currency: updated.currency,
        totalCents: updated.totalCents,
        deliveredAt: now,
      });
    }
    await deps.eventBus?.publish({
      type: 'ServiceOrderDelivered',
      serviceOrderId: updated.id,
      customerId: updated.customerId,
      totalCents: updated.totalCents,
      warrantyExpiresAt: updated.warrantyExpiresAt,
      occurredAt: now,
    });
  }

  return updated;
}
