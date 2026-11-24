import { z } from 'zod';
import {
  IsoCurrencyCodeSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  createSchemaVersionSchema,
} from '@modulos/core-shared';

export const REPORTS_SCHEMA_VERSION = 1 as const;
export const ReportSchemaVersionSchema = createSchemaVersionSchema(REPORTS_SCHEMA_VERSION);

export const SafeCentsSchema = z.number().int().refine(Number.isSafeInteger, {
  message: 'Monetary amount in cents must be a safe integer.',
});

export const NonNegativeCentsSchema = SafeCentsSchema.refine((v) => v >= 0, {
  message: 'Monetary amount in cents must be non-negative.',
});

export const NonNegativeQuantitySchema = z.number().finite().nonnegative();

export const ReportGranularitySchema = z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH']);
export type ReportGranularity = z.infer<typeof ReportGranularitySchema>;

export const ReportTypeSchema = z.enum([
  'SALES_SUMMARY',
  'TIME_SERIES',
  'TOP_ITEMS',
  'CATEGORY_BREAKDOWN',
  'ABC_PARETO',
  'PERIOD_COMPARISON',
  'CUSTOMER_ANALYTICS',
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ExportFormatSchema = z.enum(['CSV', 'JSON']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const TransactionRecordStatusSchema = z.enum(['COMPLETED', 'REFUNDED', 'VOIDED']);
export type TransactionRecordStatus = z.infer<typeof TransactionRecordStatusSchema>;

export const ReportPeriodSchema = z
  .object({
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
    granularity: ReportGranularitySchema.default('DAY'),
    timezoneOffsetMinutes: z.number().int().min(-720).max(840).default(0),
  })
  .refine((p) => new Date(p.from).getTime() <= new Date(p.to).getTime(), {
    message: 'Report period start (from) must be less than or equal to end (to).',
  });
export type ReportPeriod = z.infer<typeof ReportPeriodSchema>;

export const ReportFilterSchema = z.object({
  tenantId: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema,
  branchIds: z.array(NonEmptyStringSchema).optional(),
  channels: z.array(NonEmptyStringSchema).optional(),
  categoryIds: z.array(NonEmptyStringSchema).optional(),
  paymentMethods: z.array(NonEmptyStringSchema).optional(),
  includeVoided: z.boolean().default(false),
  includeRefunded: z.boolean().default(true),
  topLimit: z.number().int().min(1).max(500).default(20),
});
export type ReportFilter = z.infer<typeof ReportFilterSchema>;

export const PaymentSplitRecordSchema = z.object({
  method: NonEmptyStringSchema,
  amountCents: SafeCentsSchema,
});
export type PaymentSplitRecord = z.infer<typeof PaymentSplitRecordSchema>;

export const SalesLineRecordSchema = z.object({
  itemId: NonEmptyStringSchema,
  sku: NonEmptyStringSchema.optional(),
  name: NonEmptyStringSchema,
  categoryId: NonEmptyStringSchema.optional(),
  categoryName: NonEmptyStringSchema.optional(),
  quantity: NonNegativeQuantitySchema,
  unitPriceCents: NonNegativeCentsSchema,
  unitCostCents: NonNegativeCentsSchema.default(0),
  discountCents: NonNegativeCentsSchema.default(0),
  taxCents: NonNegativeCentsSchema.default(0),
  netTotalCents: SafeCentsSchema,
});
export type SalesLineRecord = z.infer<typeof SalesLineRecordSchema>;

export const SalesTransactionRecordSchema = z.object({
  schemaVersion: ReportSchemaVersionSchema.default(REPORTS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema.optional(),
  branchId: NonEmptyStringSchema.optional(),
  channel: NonEmptyStringSchema.default('POS'),
  customerId: NonEmptyStringSchema.optional(),
  occurredAt: IsoDateTimeSchema,
  currency: IsoCurrencyCodeSchema,
  status: TransactionRecordStatusSchema.default('COMPLETED'),
  grossCents: SafeCentsSchema,
  discountCents: NonNegativeCentsSchema.default(0),
  taxCents: NonNegativeCentsSchema.default(0),
  netCents: SafeCentsSchema,
  costCents: NonNegativeCentsSchema.default(0),
  payments: z.array(PaymentSplitRecordSchema).default([]),
  lines: z.array(SalesLineRecordSchema).default([]),
});
export type SalesTransactionRecord = z.infer<typeof SalesTransactionRecordSchema>;

export const InventorySnapshotRecordSchema = z.object({
  schemaVersion: ReportSchemaVersionSchema.default(REPORTS_SCHEMA_VERSION),
  itemId: NonEmptyStringSchema,
  sku: NonEmptyStringSchema.optional(),
  name: NonEmptyStringSchema,
  categoryId: NonEmptyStringSchema.optional(),
  branchId: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema,
  quantityOnHand: NonNegativeQuantitySchema,
  unitCostCents: NonNegativeCentsSchema,
  totalValueCents: NonNegativeCentsSchema,
  unitsSoldInPeriod: NonNegativeQuantitySchema.default(0),
  revenueInPeriodCents: NonNegativeCentsSchema.default(0),
  profitInPeriodCents: SafeCentsSchema.default(0),
});
export type InventorySnapshotRecord = z.infer<typeof InventorySnapshotRecordSchema>;

export const ReportDefinitionSchema = z.object({
  schemaVersion: ReportSchemaVersionSchema.default(REPORTS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema.optional(),
  name: NonEmptyStringSchema.max(120),
  description: z.string().trim().max(500).optional(),
  type: ReportTypeSchema,
  filter: ReportFilterSchema,
  defaultGranularity: ReportGranularitySchema.default('DAY'),
  createdBy: NonEmptyStringSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ReportDefinition = z.infer<typeof ReportDefinitionSchema>;
