import { z } from 'zod';
import { InvalidOrderInputError } from '../domain/errors/order-errors.js';

export const ORDER_SCHEMA_VERSION = 1 as const;

export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO 4217 code.');

export const MoneyJSONSchema = z.object({
  cents: z.number().int().refine(Number.isSafeInteger, 'Amount in cents must be a safe integer.'),
  currency: CurrencyCodeSchema,
});

export const ActorSummarySchema = z.object({
  id: z.string().trim().min(1, 'Actor id is required.'),
  name: z.string().trim().min(1, 'Actor name is required.'),
  role: z.string().trim().min(1).optional(),
});

export type ActorSummary = z.infer<typeof ActorSummarySchema>;

export const OrderDocumentKindSchema = z.enum(['ORDER', 'QUOTE', 'DELIVERY_NOTE']);

export type OrderDocumentKind = z.infer<typeof OrderDocumentKindSchema>;

export const OrderStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'IN_PROGRESS',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'EXPIRED',
]);

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderChannelSchema = z.enum(['POS', 'WEB', 'APP', 'PHONE', 'B2B', 'OTHER']);

export type OrderChannel = z.infer<typeof OrderChannelSchema>;

export const TaxModeSchema = z.enum(['EXCLUSIVE', 'INCLUSIVE']);

export type TaxMode = z.infer<typeof TaxModeSchema>;

export const TaxRuleSchema = z.object({
  id: z.string().trim().min(1, 'Tax rule id is required.'),
  code: z.string().trim().min(1, 'Tax code is required.').transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, 'Tax name is required.'),
  ratePercent: z
    .number()
    .finite()
    .min(0, 'Tax rate cannot be negative.')
    .max(100, 'Tax rate cannot exceed 100%.'),
  mode: TaxModeSchema,
});

export type TaxRule = z.infer<typeof TaxRuleSchema>;

export const DiscountTypeSchema = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);

export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export const DiscountRuleSchema = z
  .object({
    id: z.string().trim().min(1, 'Discount id is required.'),
    type: DiscountTypeSchema,
    value: z.number().finite().min(0, 'Discount value cannot be negative.'),
    couponCode: z
      .string()
      .trim()
      .min(1)
      .transform((s) => s.toUpperCase())
      .optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'PERCENTAGE' && val.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage discount cannot exceed 100%.',
      });
    }
    if (val.type === 'FIXED_AMOUNT' && !Number.isSafeInteger(val.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Fixed discount amount must be specified in integer minor units (cents).',
      });
    }
  });

export type DiscountRule = z.infer<typeof DiscountRuleSchema>;

export const CouponDefinitionSchema = z
  .object({
    schemaVersion: z.literal(ORDER_SCHEMA_VERSION).default(ORDER_SCHEMA_VERSION),
    code: z
      .string()
      .trim()
      .min(1, 'Coupon code is required.')
      .transform((s) => s.toUpperCase()),
    discountType: DiscountTypeSchema,
    value: z.number().finite().min(0, 'Coupon value cannot be negative.'),
    currency: CurrencyCodeSchema.optional(),
    minOrderAmountCents: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, 'Minimum order amount must be a safe integer.')
      .optional(),
    maxDiscountAmountCents: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, 'Max discount amount must be a safe integer.')
      .optional(),
    expiresAt: z.string().datetime().optional(),
    maxUses: z.number().int().positive().optional(),
    currentUses: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.discountType === 'PERCENTAGE' && val.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage coupon cannot exceed 100%.',
      });
    }
    if (val.discountType === 'FIXED_AMOUNT' && !Number.isSafeInteger(val.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Fixed coupon value must be in integer minor units (cents).',
      });
    }
  });

export type CouponDefinition = z.infer<typeof CouponDefinitionSchema>;

export const OrderMetadataSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number().finite(), z.boolean()])
);

export type OrderMetadata = z.infer<typeof OrderMetadataSchema>;

export const OrderLineInputSchema = z.object({
  lineId: z.string().trim().min(1, 'lineId is required.'),
  productId: z.string().trim().min(1, 'productId is required.'),
  sku: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, 'Product name is required.'),
  quantity: z.number().finite().positive('Quantity must be greater than zero.'),
  unitPriceCents: z
    .number()
    .int()
    .nonnegative('Unit price cannot be negative.')
    .refine(Number.isSafeInteger, 'Unit price must be a safe integer in cents.'),
  taxes: z.array(TaxRuleSchema).default([]),
  discounts: z.array(DiscountRuleSchema).default([]),
  notes: z.string().trim().min(1).optional(),
  metadata: OrderMetadataSchema.optional(),
});

export type OrderLineInput = z.input<typeof OrderLineInputSchema>;
export type ParsedOrderLineInput = z.infer<typeof OrderLineInputSchema>;

export const OrderLineSnapshotSchema = z.object({
  lineId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  sku: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unitPriceCents: z.number().int().nonnegative().refine(Number.isSafeInteger),
  taxes: z.array(TaxRuleSchema),
  discounts: z.array(DiscountRuleSchema),
  notes: z.string().trim().min(1).optional(),
  metadata: OrderMetadataSchema.optional(),
});

export type OrderLineSnapshot = z.infer<typeof OrderLineSnapshotSchema>;

export const OrderStatusChangeRecordSchema = z.object({
  from: OrderStatusSchema.nullable(),
  to: OrderStatusSchema,
  changedAt: z.string().datetime(),
  changedBy: ActorSummarySchema.optional(),
  reason: z.string().trim().min(1).optional(),
});

export type OrderStatusChangeRecord = z.infer<typeof OrderStatusChangeRecordSchema>;

export const FulfillmentModeSchema = z.enum([
  'DINE_IN',
  'TAKEOUT',
  'PICKUP',
  'DELIVERY',
  'SHIPPING',
]);
export type FulfillmentMode = z.infer<typeof FulfillmentModeSchema>;

export const FulfillmentDetailsSchema = z.object({
  mode: FulfillmentModeSchema,
  tableNumber: z.string().trim().min(1).optional(),
  recipientName: z.string().trim().min(1).optional(),
  destinationAddress: z.string().trim().min(1).optional(),
  instructions: z.string().trim().min(1).optional(),
  scheduledFor: z.string().datetime().optional(),
});
export type FulfillmentDetails = z.infer<typeof FulfillmentDetailsSchema>;

export const OrderSurchargeSchema = z
  .object({
    id: z.string().trim().min(1),
    code: z.string().trim().min(1).transform((s) => s.toUpperCase()),
    name: z.string().trim().min(1),
    type: DiscountTypeSchema,
    value: z.number().finite().min(0),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'PERCENTAGE' && val.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage surcharge cannot exceed 100%.',
      });
    }
    if (val.type === 'FIXED_AMOUNT' && !Number.isSafeInteger(val.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Fixed surcharge amount must be specified in integer minor units (cents).',
      });
    }
  });
export type OrderSurcharge = z.infer<typeof OrderSurchargeSchema>;

export const OrderSnapshotSchema = z.object({
  schemaVersion: z.literal(ORDER_SCHEMA_VERSION),
  id: z.string().trim().min(1),
  documentKind: OrderDocumentKindSchema.default('ORDER'),
  orderNumber: z.string().trim().min(1).optional(),
  channel: OrderChannelSchema,
  status: OrderStatusSchema,
  currency: CurrencyCodeSchema,
  customerId: z.string().trim().min(1).optional(),
  quoteExpiresAt: z.string().datetime().optional(),
  sourceDocumentId: z.string().trim().min(1).optional(),
  sourceDocumentIds: z.array(z.string().trim().min(1)).default([]),
  externalImportRef: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  metadata: OrderMetadataSchema.optional(),
  lines: z.array(OrderLineSnapshotSchema),
  orderDiscounts: z.array(DiscountRuleSchema),
  surcharges: z.array(OrderSurchargeSchema).default([]),
  fulfillment: FulfillmentDetailsSchema.optional(),
  isParked: z.boolean().default(false),
  parkedAt: z.string().datetime().optional(),
  parkReason: z.string().trim().min(1).optional(),
  statusHistory: z.array(OrderStatusChangeRecordSchema),
  processedOperationKeys: z.array(z.string().min(1)),
  idempotencyKey: z.string().trim().min(1).optional(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  refundedAt: z.string().datetime().optional(),
});

export type OrderSnapshot = z.infer<typeof OrderSnapshotSchema>;

export const OrderFeatureFlagsSchema = z
  .object({
    lineDiscounts: z.boolean(),
    orderDiscounts: z.boolean(),
    coupons: z.boolean(),
    inclusiveTaxes: z.boolean(),
    multipleTaxesPerLine: z.boolean(),
    workflowStates: z.boolean(),
    fractionalQuantities: z.boolean(),
    refunds: z.boolean(),
    offlineIdempotency: z.boolean(),
    optimisticConcurrency: z.boolean(),
    auditTrail: z.boolean(),
    parkedOrders: z.boolean(),
    fulfillmentDetails: z.boolean(),
    surchargesAndFees: z.boolean(),
    orderSplitting: z.boolean(),
    quotes: z.boolean(),
    deliveryNotes: z.boolean(),
    documentConsolidation: z.boolean(),
    documentImport: z.boolean(),
  })
  .partial();

export const OrderFeatureProfileSchema = z
  .union([z.enum(['BASIC', 'INTERMEDIATE', 'ADVANCED']), OrderFeatureFlagsSchema])
  .optional();

export const CreateOrderInputSchema = z.object({
  id: z.string().trim().min(1, 'Order id is required.'),
  documentKind: OrderDocumentKindSchema.default('ORDER'),
  orderNumber: z.string().trim().min(1).optional(),
  channel: OrderChannelSchema.default('POS'),
  currency: CurrencyCodeSchema.default('USD'),
  customerId: z.string().trim().min(1).optional(),
  quoteExpiresAt: z.string().datetime().optional(),
  sourceDocumentId: z.string().trim().min(1).optional(),
  sourceDocumentIds: z.array(z.string().trim().min(1)).optional(),
  externalImportRef: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  metadata: OrderMetadataSchema.optional(),
  lines: z.array(OrderLineInputSchema).default([]),
  orderDiscounts: z.array(DiscountRuleSchema).default([]),
  initialStatus: z.enum(['DRAFT', 'PENDING', 'COMPLETED']).default('DRAFT'),
  createdBy: ActorSummarySchema.optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});

export type CreateOrderInput = z.input<typeof CreateOrderInputSchema>;

export const AddOrderLineInputSchema = z.object({
  orderId: z.string().trim().min(1),
  line: OrderLineInputSchema,
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});

export type AddOrderLineInput = z.input<typeof AddOrderLineInputSchema>;

export const UpdateOrderLineInputSchema = z.object({
  orderId: z.string().trim().min(1),
  lineId: z.string().trim().min(1),
  quantity: z.number().finite().positive().optional(),
  unitPriceCents: z.number().int().nonnegative().refine(Number.isSafeInteger).optional(),
  taxes: z.array(TaxRuleSchema).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  metadata: OrderMetadataSchema.optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});

export type UpdateOrderLineInput = z.input<typeof UpdateOrderLineInputSchema>;

export const RemoveOrderLineInputSchema = z.object({
  orderId: z.string().trim().min(1),
  lineId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});

export type RemoveOrderLineInput = z.input<typeof RemoveOrderLineInputSchema>;

export const ApplyOrderDiscountInputSchema = z
  .object({
    orderId: z.string().trim().min(1),
    lineId: z.string().trim().min(1).optional(),
    discount: DiscountRuleSchema.optional(),
    couponCode: z.string().trim().min(1).optional(),
    discountId: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
    featureProfile: OrderFeatureProfileSchema,
  })
  .superRefine((val, ctx) => {
    if (!val.discount && !val.couponCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either discount or couponCode must be provided.',
      });
    }
  });

export type ApplyOrderDiscountInput = z.input<typeof ApplyOrderDiscountInputSchema>;

export const RemoveOrderDiscountInputSchema = z.object({
  orderId: z.string().trim().min(1),
  discountId: z.string().trim().min(1),
  lineId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});

export type RemoveOrderDiscountInput = z.input<typeof RemoveOrderDiscountInputSchema>;

export const TransitionOrderStatusInputSchema = z.object({
  orderId: z.string().trim().min(1),
  targetStatus: OrderStatusSchema,
  actor: ActorSummarySchema.optional(),
  reason: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});

export type TransitionOrderStatusInput = z.input<typeof TransitionOrderStatusInputSchema>;

/**
 * Parses and validates unknown input against a Zod schema, throwing `InvalidOrderInputError` on failure.
 */
export function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown, context = 'input'): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    const summary = issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new InvalidOrderInputError(`Invalid ${context}: ${summary}`, issues);
  }
  return result.data;
}
