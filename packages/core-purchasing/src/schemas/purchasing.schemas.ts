import { z } from 'zod';
import {
  IsoCurrencyCodeSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  createSchemaVersionSchema,
} from '@modulos/core-shared';

export const PURCHASING_SCHEMA_VERSION = 1;
export const PurchasingSchemaVersionSchema = createSchemaVersionSchema(PURCHASING_SCHEMA_VERSION);

export const CentsSchema = z.number().int().nonnegative();
export const PositiveQuantitySchema = z.number().positive();
export const NonNegativeQuantitySchema = z.number().nonnegative();
export const BasisPointsSchema = z.number().int().min(0).max(100_000);

export const SupplierStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']);
export type SupplierStatus = z.infer<typeof SupplierStatusSchema>;

export const PaymentTermsTypeSchema = z.enum(['CASH', 'CREDIT']);
export type PaymentTermsType = z.infer<typeof PaymentTermsTypeSchema>;

export const SupplierAddressKindSchema = z.enum(['PRIMARY', 'BILLING', 'WAREHOUSE', 'PICKUP']);
export type SupplierAddressKind = z.infer<typeof SupplierAddressKindSchema>;

export const SupplierAddressSchema = z.object({
  id: NonEmptyStringSchema,
  kind: SupplierAddressKindSchema.default('PRIMARY'),
  label: NonEmptyStringSchema.optional(),
  line1: NonEmptyStringSchema,
  line2: NonEmptyStringSchema.optional(),
  city: NonEmptyStringSchema,
  state: NonEmptyStringSchema.optional(),
  postalCode: NonEmptyStringSchema,
  countryCode: z.string().trim().toUpperCase().length(2).default('MX'),
  isDefault: z.boolean().default(false),
});
export type SupplierAddress = z.infer<typeof SupplierAddressSchema>;

export const SupplierSchema = z.object({
  schemaVersion: PurchasingSchemaVersionSchema,
  id: NonEmptyStringSchema,
  code: NonEmptyStringSchema.optional(),
  name: NonEmptyStringSchema,
  legalName: NonEmptyStringSchema.optional(),
  taxId: NonEmptyStringSchema.optional(),
  email: z.string().email().optional(),
  phone: NonEmptyStringSchema.optional(),
  address: NonEmptyStringSchema.optional(),
  addresses: z.array(SupplierAddressSchema).default([]),
  currency: IsoCurrencyCodeSchema.default('MXN'),
  paymentTerms: PaymentTermsTypeSchema.default('CASH'),
  creditDays: z.number().int().min(0).default(0),
  creditLimitCents: CentsSchema.default(0),
  unlimitedCredit: z.boolean().default(false),
  status: SupplierStatusSchema.default('ACTIVE'),
  notes: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const SupplierProductSchema = z.object({
  schemaVersion: PurchasingSchemaVersionSchema,
  id: NonEmptyStringSchema,
  supplierId: NonEmptyStringSchema,
  productId: NonEmptyStringSchema,
  supplierSku: NonEmptyStringSchema.optional(),
  purchaseUom: NonEmptyStringSchema.default('UNIT'),
  packSize: z.number().positive().default(1),
  lastUnitCostCents: CentsSchema,
  currency: IsoCurrencyCodeSchema.default('MXN'),
  minOrderQuantity: z.number().positive().default(1),
  leadTimeDays: z.number().int().min(0).default(0),
  isPreferred: z.boolean().default(false),
  updatedAt: IsoDateTimeSchema,
});
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;

export const PurchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'APPROVED',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

export const PurchaseOrderLineSchema = z.object({
  id: NonEmptyStringSchema,
  productId: NonEmptyStringSchema,
  supplierSku: NonEmptyStringSchema.optional(),
  description: NonEmptyStringSchema,
  purchaseUom: NonEmptyStringSchema.default('UNIT'),
  packSize: z.number().positive().default(1),
  orderedQuantity: PositiveQuantitySchema,
  receivedQuantity: NonNegativeQuantitySchema.default(0),
  unitCostCents: CentsSchema,
  discountCents: CentsSchema.default(0),
  taxRateBps: BasisPointsSchema.default(0),
  lineSubtotalCents: CentsSchema,
  lineTaxCents: CentsSchema,
  lineTotalCents: CentsSchema,
});
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;

export const PurchaseOrderSchema = z.object({
  schemaVersion: PurchasingSchemaVersionSchema,
  id: NonEmptyStringSchema,
  orderNumber: NonEmptyStringSchema,
  supplierId: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  currency: IsoCurrencyCodeSchema.default('MXN'),
  status: PurchaseOrderStatusSchema.default('DRAFT'),
  lines: z.array(PurchaseOrderLineSchema),
  subtotalCents: CentsSchema,
  discountCents: CentsSchema,
  taxCents: CentsSchema,
  totalCents: CentsSchema,
  expectedDeliveryAt: IsoDateTimeSchema.optional(),
  notes: z.string().optional(),
  createdBy: NonEmptyStringSchema.optional(),
  approvedBy: NonEmptyStringSchema.optional(),
  approvedAt: IsoDateTimeSchema.optional(),
  sentAt: IsoDateTimeSchema.optional(),
  cancelledAt: IsoDateTimeSchema.optional(),
  cancellationReason: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const PurchaseReceiptLineSchema = z.object({
  id: NonEmptyStringSchema,
  purchaseOrderLineId: NonEmptyStringSchema.optional(),
  productId: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  purchaseUom: NonEmptyStringSchema.default('UNIT'),
  packSize: z.number().positive().default(1),
  acceptedQuantity: NonNegativeQuantitySchema,
  rejectedQuantity: NonNegativeQuantitySchema.default(0),
  /** Total base inventory units = acceptedQuantity * packSize */
  baseUnitsReceived: NonNegativeQuantitySchema,
  /** Cost per purchase UOM (e.g. per box) in cents */
  unitCostCents: CentsSchema,
  /** Net cost per single base inventory unit in cents */
  baseUnitCostCents: CentsSchema,
  discountCents: CentsSchema.default(0),
  taxRateBps: BasisPointsSchema.default(0),
  lineSubtotalCents: CentsSchema,
  lineTaxCents: CentsSchema,
  lineTotalCents: CentsSchema,
  lotNumber: NonEmptyStringSchema.optional(),
  expirationDate: IsoDateTimeSchema.optional(),
  rejectionReason: z.string().optional(),
});
export type PurchaseReceiptLine = z.infer<typeof PurchaseReceiptLineSchema>;

export const PurchaseReceiptSchema = z.object({
  schemaVersion: PurchasingSchemaVersionSchema,
  id: NonEmptyStringSchema,
  receiptNumber: NonEmptyStringSchema,
  purchaseOrderId: NonEmptyStringSchema.optional(),
  supplierId: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  invoiceNumber: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema.default('MXN'),
  lines: z.array(PurchaseReceiptLineSchema).min(1),
  subtotalCents: CentsSchema,
  discountCents: CentsSchema,
  taxCents: CentsSchema,
  totalCents: CentsSchema,
  receivedBy: NonEmptyStringSchema.optional(),
  notes: z.string().optional(),
  receivedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});
export type PurchaseReceipt = z.infer<typeof PurchaseReceiptSchema>;

export const PayableStatusSchema = z.enum(['OPEN', 'PARTIAL', 'PAID', 'CANCELLED']);
export type PayableStatus = z.infer<typeof PayableStatusSchema>;

export const SupplierPaymentRecordSchema = z.object({
  id: NonEmptyStringSchema,
  amountCents: z.number().int().positive(),
  paymentMethod: NonEmptyStringSchema,
  reference: NonEmptyStringSchema.optional(),
  paidBy: NonEmptyStringSchema.optional(),
  paidAt: IsoDateTimeSchema,
  notes: z.string().optional(),
});
export type SupplierPaymentRecord = z.infer<typeof SupplierPaymentRecordSchema>;

export const SupplierPayableSchema = z.object({
  schemaVersion: PurchasingSchemaVersionSchema,
  id: NonEmptyStringSchema,
  supplierId: NonEmptyStringSchema,
  receiptId: NonEmptyStringSchema,
  purchaseOrderId: NonEmptyStringSchema.optional(),
  invoiceNumber: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema.default('MXN'),
  originalAmountCents: CentsSchema,
  paidAmountCents: CentsSchema.default(0),
  balanceCents: CentsSchema,
  status: PayableStatusSchema.default('OPEN'),
  dueAt: IsoDateTimeSchema,
  payments: z.array(SupplierPaymentRecordSchema).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SupplierPayable = z.infer<typeof SupplierPayableSchema>;

export const SupplierReturnLineSchema = z.object({
  id: NonEmptyStringSchema,
  productId: NonEmptyStringSchema,
  quantity: PositiveQuantitySchema,
  unitCostCents: CentsSchema,
  lineTotalCents: CentsSchema,
  reason: NonEmptyStringSchema,
  lotNumber: NonEmptyStringSchema.optional(),
});
export type SupplierReturnLine = z.infer<typeof SupplierReturnLineSchema>;

export const SupplierReturnSchema = z.object({
  schemaVersion: PurchasingSchemaVersionSchema,
  id: NonEmptyStringSchema,
  returnNumber: NonEmptyStringSchema,
  supplierId: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  receiptId: NonEmptyStringSchema.optional(),
  currency: IsoCurrencyCodeSchema.default('MXN'),
  lines: z.array(SupplierReturnLineSchema).min(1),
  totalCents: CentsSchema,
  createdBy: NonEmptyStringSchema.optional(),
  notes: z.string().optional(),
  returnedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});
export type SupplierReturn = z.infer<typeof SupplierReturnSchema>;
