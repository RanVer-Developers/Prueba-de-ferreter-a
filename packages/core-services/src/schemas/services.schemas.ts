import { z } from 'zod';
import {
  IsoCurrencyCodeSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  createSchemaVersionSchema,
} from '@modulos/core-shared';

export const SERVICES_SCHEMA_VERSION = 1;
export const ServicesSchemaVersionSchema = createSchemaVersionSchema(SERVICES_SCHEMA_VERSION);

export const NonNegativeCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, { message: 'Cents must be a safe integer.' });

export const PositiveQuantitySchema = z.number().finite().positive();
export const BasisPointsSchema = z.number().int().min(0).max(100_000);

export const ServiceOrderTypeSchema = z.enum([
  'REPAIR',
  'MAINTENANCE',
  'CUTTING_MILLING',
  'INSTALLATION',
  'WARRANTY',
]);
export type ServiceOrderType = z.infer<typeof ServiceOrderTypeSchema>;

export const ServiceOrderStatusSchema = z.enum([
  'INTAKE',
  'DIAGNOSIS',
  'QUOTED',
  'APPROVED',
  'IN_PROGRESS',
  'QUALITY_CHECK',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'CANCELLED',
]);
export type ServiceOrderStatus = z.infer<typeof ServiceOrderStatusSchema>;

export const ServiceAssetSchema = z.object({
  description: NonEmptyStringSchema,
  brand: NonEmptyStringSchema.optional(),
  model: NonEmptyStringSchema.optional(),
  serialNumber: NonEmptyStringSchema.optional(),
  intakeCondition: z.string().trim().max(500).optional(),
  accessories: z.array(NonEmptyStringSchema).default([]),
});
export type ServiceAsset = z.infer<typeof ServiceAssetSchema>;

export const ServiceLaborLineSchema = z.object({
  id: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  technicianId: NonEmptyStringSchema.optional(),
  hours: PositiveQuantitySchema,
  hourlyRateCents: NonNegativeCentsSchema,
  taxRateBps: BasisPointsSchema.default(0),
  subtotalCents: NonNegativeCentsSchema,
  taxCents: NonNegativeCentsSchema,
  totalCents: NonNegativeCentsSchema,
  performedAt: IsoDateTimeSchema,
});
export type ServiceLaborLine = z.infer<typeof ServiceLaborLineSchema>;

export const ServicePartLineSchema = z.object({
  id: NonEmptyStringSchema,
  productId: NonEmptyStringSchema,
  sku: NonEmptyStringSchema.optional(),
  description: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  quantity: PositiveQuantitySchema,
  unitPriceCents: NonNegativeCentsSchema,
  unitCostCents: NonNegativeCentsSchema.default(0),
  taxRateBps: BasisPointsSchema.default(0),
  subtotalCents: NonNegativeCentsSchema,
  taxCents: NonNegativeCentsSchema,
  totalCents: NonNegativeCentsSchema,
  consumedAt: IsoDateTimeSchema,
});
export type ServicePartLine = z.infer<typeof ServicePartLineSchema>;

export const ServiceStatusChangeSchema = z.object({
  from: ServiceOrderStatusSchema.nullable(),
  to: ServiceOrderStatusSchema,
  changedBy: NonEmptyStringSchema.optional(),
  reason: z.string().trim().max(300).optional(),
  occurredAt: IsoDateTimeSchema,
});
export type ServiceStatusChange = z.infer<typeof ServiceStatusChangeSchema>;

export const ServiceOrderSchema = z.object({
  schemaVersion: ServicesSchemaVersionSchema.default(SERVICES_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  orderNumber: NonEmptyStringSchema,
  type: ServiceOrderTypeSchema,
  status: ServiceOrderStatusSchema,
  branchId: NonEmptyStringSchema.optional(),
  customerId: NonEmptyStringSchema,
  assignedTechnicianId: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema.default('MXN'),
  asset: ServiceAssetSchema,
  reportedIssue: NonEmptyStringSchema,
  diagnosisNotes: z.string().trim().max(1000).optional(),
  estimatedTotalCents: NonNegativeCentsSchema.optional(),
  isUnderWarranty: z.boolean().default(false),
  warrantyDays: z.number().int().min(0).default(0),
  warrantyExpiresAt: IsoDateTimeSchema.optional(),
  laborLines: z.array(ServiceLaborLineSchema).default([]),
  partLines: z.array(ServicePartLineSchema).default([]),
  laborSubtotalCents: NonNegativeCentsSchema.default(0),
  partsSubtotalCents: NonNegativeCentsSchema.default(0),
  taxTotalCents: NonNegativeCentsSchema.default(0),
  totalCents: NonNegativeCentsSchema.default(0),
  statusHistory: z.array(ServiceStatusChangeSchema),
  processedIdempotencyKeys: z.array(NonEmptyStringSchema).default([]),
  version: z.number().int().positive().default(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  approvedAt: IsoDateTimeSchema.optional(),
  deliveredAt: IsoDateTimeSchema.optional(),
  cancelledAt: IsoDateTimeSchema.optional(),
});
export type ServiceOrder = z.infer<typeof ServiceOrderSchema>;
