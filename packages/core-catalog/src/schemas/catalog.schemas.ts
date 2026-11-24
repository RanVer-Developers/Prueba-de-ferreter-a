import { z } from 'zod';
import { InvalidCatalogInputError } from '../domain/errors/catalog-errors.js';

export const CATALOG_SCHEMA_VERSION = 1 as const;

export const NonEmptyIdSchema = z.string().trim().min(1, 'Identifier cannot be empty.');
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO 4217 code.');

export const CatalogItemTypeSchema = z.enum(['PHYSICAL', 'SERVICE', 'DIGITAL', 'BUNDLE']);
export type CatalogItemType = z.infer<typeof CatalogItemTypeSchema>;

export const CatalogItemStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export type CatalogItemStatus = z.infer<typeof CatalogItemStatusSchema>;

export const SalesChannelSchema = z.enum(['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE']);
export type SalesChannel = z.infer<typeof SalesChannelSchema>;

export const CatalogMetadataSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number().finite(), z.boolean()])
);
export type CatalogMetadata = z.infer<typeof CatalogMetadataSchema>;

export const TaxHintSchema = z.object({
  taxCode: z.string().trim().min(1),
  ratePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean().default(true),
  fiscalClassificationCode: z.string().trim().min(1).optional(),
});
export type TaxHint = z.infer<typeof TaxHintSchema>;

export const VariantAttributeSchema = z.record(z.string().min(1), z.string().trim().min(1));

export const CatalogVariantSchema = z.object({
  id: NonEmptyIdSchema,
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  barcodes: z.array(z.string().trim().min(1)).default([]),
  attributes: VariantAttributeSchema.default({}),
  basePriceCents: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});
export type CatalogVariant = z.infer<typeof CatalogVariantSchema>;

export const ModifierOptionSchema = z.object({
  id: NonEmptyIdSchema,
  name: z.string().trim().min(1),
  priceDeltaCents: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  maxQuantity: z.number().int().min(1).default(1),
});
export type ModifierOption = z.infer<typeof ModifierOptionSchema>;

export const ModifierGroupSchema = z.object({
  id: NonEmptyIdSchema,
  name: z.string().trim().min(1),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  options: z.array(ModifierOptionSchema).min(1),
});
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

export const BundleComponentSchema = z.object({
  itemId: NonEmptyIdSchema,
  variantId: NonEmptyIdSchema.optional(),
  quantity: z.number().positive(),
});
export type BundleComponent = z.infer<typeof BundleComponentSchema>;

export const CategorySnapshotSchema = z.object({
  schemaVersion: z
    .number()
    .int()
    .min(1)
    .refine((v) => v <= CATALOG_SCHEMA_VERSION, {
      error: (iss) =>
        `Unsupported Category schemaVersion ${String(iss.input)} (max ${CATALOG_SCHEMA_VERSION}).`,
    })
    .default(CATALOG_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  parentId: NonEmptyIdSchema.optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  channels: z.array(SalesChannelSchema).default(['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE']),
  version: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CategorySnapshot = z.infer<typeof CategorySnapshotSchema>;

export const CatalogItemSnapshotSchema = z.object({
  schemaVersion: z
    .number()
    .int()
    .min(1)
    .refine((v) => v <= CATALOG_SCHEMA_VERSION, {
      error: (iss) =>
        `Unsupported CatalogItem schemaVersion ${String(iss.input)} (max ${CATALOG_SCHEMA_VERSION}).`,
    })
    .default(CATALOG_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  type: CatalogItemTypeSchema.default('PHYSICAL'),
  status: CatalogItemStatusSchema.default('ACTIVE'),
  categoryIds: z.array(NonEmptyIdSchema).default([]),
  barcodes: z.array(z.string().trim().min(1)).default([]),
  currency: CurrencyCodeSchema.default('MXN'),
  basePriceCents: z.number().int().min(0),
  unitLabel: z.string().trim().min(1).default('UNIT'),
  durationMinutes: z.number().int().positive().optional(),
  taxHint: TaxHintSchema.optional(),
  variants: z.array(CatalogVariantSchema).default([]),
  modifierGroups: z.array(ModifierGroupSchema).default([]),
  bundleComponents: z.array(BundleComponentSchema).default([]),
  channels: z.array(SalesChannelSchema).default(['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE']),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: CatalogMetadataSchema.optional(),
  version: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CatalogItemSnapshot = z.infer<typeof CatalogItemSnapshotSchema>;

export const VolumeTierPriceSchema = z.object({
  minQuantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
});
export type VolumeTierPrice = z.infer<typeof VolumeTierPriceSchema>;

export const PriceListEntrySchema = z.object({
  itemId: NonEmptyIdSchema,
  variantId: NonEmptyIdSchema.optional(),
  unitPriceCents: z.number().int().min(0),
  volumeTiers: z.array(VolumeTierPriceSchema).default([]),
});
export type PriceListEntry = z.infer<typeof PriceListEntrySchema>;

export const PriceListSnapshotSchema = z.object({
  schemaVersion: z
    .number()
    .int()
    .min(1)
    .refine((v) => v <= CATALOG_SCHEMA_VERSION, {
      error: (iss) =>
        `Unsupported PriceList schemaVersion ${String(iss.input)} (max ${CATALOG_SCHEMA_VERSION}).`,
    })
    .default(CATALOG_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  code: z.string().trim().min(1).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1),
  currency: CurrencyCodeSchema.default('MXN'),
  priority: z.number().int().default(0),
  channels: z.array(SalesChannelSchema).default(['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE']),
  customerSegments: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().default(true),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  entries: z.array(PriceListEntrySchema).default([]),
  version: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PriceListSnapshot = z.infer<typeof PriceListSnapshotSchema>;

export const PromotionTypeSchema = z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y']);
export type PromotionType = z.infer<typeof PromotionTypeSchema>;

export const PromotionSnapshotSchema = z
  .object({
    schemaVersion: z
      .number()
      .int()
      .min(1)
      .refine((v) => v <= CATALOG_SCHEMA_VERSION, {
        error: (iss) =>
          `Unsupported Promotion schemaVersion ${String(iss.input)} (max ${CATALOG_SCHEMA_VERSION}).`,
      })
      .default(CATALOG_SCHEMA_VERSION),
    id: NonEmptyIdSchema,
    code: z.string().trim().min(1).transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1),
    type: PromotionTypeSchema,
    /** Percentage in 0..100 for PERCENTAGE, or cents for FIXED_AMOUNT. */
    value: z.number().finite().min(0),
    currency: CurrencyCodeSchema.optional(),
    buyQuantity: z.number().int().positive().optional(),
    getQuantity: z.number().int().positive().optional(),
    targetItemIds: z.array(NonEmptyIdSchema).default([]),
    targetCategoryIds: z.array(NonEmptyIdSchema).default([]),
    channels: z.array(SalesChannelSchema).default(['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE']),
    customerSegments: z.array(z.string().trim().min(1)).default([]),
    minQuantity: z.number().finite().positive().default(1),
    priority: z.number().int().default(0),
    stackable: z.boolean().default(false),
    isActive: z.boolean().default(true),
    validFrom: z.string().datetime().optional(),
    validTo: z.string().datetime().optional(),
    version: z.number().int().min(0).default(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'PERCENTAGE' && (val.value <= 0 || val.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage promotion value must be between 0 and 100.',
      });
    }
    if (val.type === 'FIXED_AMOUNT' && (!Number.isSafeInteger(val.value) || val.value <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Fixed amount promotion value must be positive integer cents.',
      });
    }
    if (val.type === 'BUY_X_GET_Y' && (!val.buyQuantity || !val.getQuantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buyQuantity'],
        message: 'BUY_X_GET_Y promotion requires buyQuantity and getQuantity.',
      });
    }
  });
export type PromotionSnapshot = z.infer<typeof PromotionSnapshotSchema>;

export function parseWithCatalogSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  context = 'catalog input'
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
  const summary = issues.map((i) => `${i.path}: ${i.message}`).join('; ');
  throw new InvalidCatalogInputError(`Invalid ${context}: ${summary}`, issues);
}
