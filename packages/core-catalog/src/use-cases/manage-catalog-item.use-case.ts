import { z } from 'zod';
import {
  CatalogEventPublisher,
  ICatalogItemRepository,
  IClock,
  SystemClock,
} from '../contracts/catalog-contracts.js';
import { CatalogItem } from '../domain/entities/catalog-item.js';
import {
  CatalogItemNotFoundError,
  DuplicateCatalogKeyError,
} from '../domain/errors/catalog-errors.js';
import {
  CatalogFeatureFlags,
  CatalogFeatureProfile,
  assertCatalogFeatureEnabled,
  isCatalogFeatureEnabled,
  resolveCatalogFeatures,
} from '../domain/services/catalog-features.js';
import {
  BundleComponentSchema,
  CatalogItemStatusSchema,
  CatalogItemTypeSchema,
  CatalogMetadataSchema,
  CatalogVariantSchema,
  CurrencyCodeSchema,
  ModifierGroupSchema,
  NonEmptyIdSchema,
  SalesChannelSchema,
  TaxHintSchema,
  parseWithCatalogSchema,
} from '../schemas/catalog.schemas.js';

const CreateCatalogItemInputSchema = z.object({
  id: NonEmptyIdSchema,
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  type: CatalogItemTypeSchema.default('PHYSICAL'),
  status: CatalogItemStatusSchema.default('ACTIVE'),
  categoryIds: z.array(NonEmptyIdSchema).optional(),
  barcodes: z.array(z.string().trim().min(1)).optional(),
  currency: CurrencyCodeSchema.default('MXN'),
  basePriceCents: z.number().int().min(0),
  unitLabel: z.string().trim().min(1).optional(),
  durationMinutes: z.number().int().positive().optional(),
  taxHint: TaxHintSchema.optional(),
  variants: z.array(CatalogVariantSchema).optional(),
  modifierGroups: z.array(ModifierGroupSchema).optional(),
  bundleComponents: z.array(BundleComponentSchema).optional(),
  channels: z.array(SalesChannelSchema).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  metadata: CatalogMetadataSchema.optional(),
});

const UpdateCatalogItemInputSchema = z.object({
  itemId: NonEmptyIdSchema,
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  status: CatalogItemStatusSchema.optional(),
  categoryIds: z.array(NonEmptyIdSchema).optional(),
  barcodes: z.array(z.string().trim().min(1)).optional(),
  basePriceCents: z.number().int().min(0).optional(),
  unitLabel: z.string().trim().min(1).optional(),
  taxHint: TaxHintSchema.optional(),
  channels: z.array(SalesChannelSchema).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  metadata: CatalogMetadataSchema.optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

const ExpectedVersionSchema = z.number().int().min(0).optional();

export type CreateCatalogItemInput = z.input<typeof CreateCatalogItemInputSchema>;
export type UpdateCatalogItemInput = z.input<typeof UpdateCatalogItemInputSchema>;

export interface ManageCatalogItemDeps {
  itemRepo: ICatalogItemRepository;
  publishEvent?: CatalogEventPublisher;
  clock?: IClock;
  featureProfile?: CatalogFeatureProfile;
}

export class ManageCatalogItemUseCase {
  private readonly clock: IClock;
  private readonly features: CatalogFeatureFlags;

  constructor(private readonly deps: ManageCatalogItemDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCatalogFeatures(deps.featureProfile);
  }

  public async create(rawInput: CreateCatalogItemInput): Promise<CatalogItem> {
    const input = parseWithCatalogSchema(
      CreateCatalogItemInputSchema,
      rawInput,
      'create catalog item input'
    );

    if (input.variants && input.variants.length > 0) {
      assertCatalogFeatureEnabled(this.features, 'variants');
    }
    if (input.modifierGroups && input.modifierGroups.length > 0) {
      assertCatalogFeatureEnabled(this.features, 'modifiersAndAddons');
    }
    if (input.type === 'BUNDLE' || (input.bundleComponents && input.bundleComponents.length > 0)) {
      assertCatalogFeatureEnabled(this.features, 'bundlesAndKits');
    }
    if (input.barcodes && input.barcodes.length > 1) {
      assertCatalogFeatureEnabled(this.features, 'multiBarcodeLookup');
    }
    if (input.taxHint) {
      assertCatalogFeatureEnabled(this.features, 'taxProfileHints');
    }

    if (await this.deps.itemRepo.findById(input.id)) {
      throw new DuplicateCatalogKeyError('id', input.id);
    }

    const seenSkus = new Set<string>([input.sku.toLowerCase()]);
    if (await this.deps.itemRepo.findBySku(input.sku)) {
      throw new DuplicateCatalogKeyError('sku', input.sku);
    }

    const seenBarcodes = new Set<string>();
    for (const bc of input.barcodes ?? []) {
      const norm = bc.toLowerCase();
      if (seenBarcodes.has(norm) || (await this.deps.itemRepo.findByBarcode(bc))) {
        throw new DuplicateCatalogKeyError('barcode', bc);
      }
      seenBarcodes.add(norm);
    }

    for (const variant of input.variants ?? []) {
      const normSku = variant.sku.toLowerCase();
      if (seenSkus.has(normSku) || (await this.deps.itemRepo.findBySku(variant.sku))) {
        throw new DuplicateCatalogKeyError('sku', variant.sku);
      }
      seenSkus.add(normSku);

      for (const bc of variant.barcodes) {
        const normBc = bc.toLowerCase();
        if (seenBarcodes.has(normBc) || (await this.deps.itemRepo.findByBarcode(bc))) {
          throw new DuplicateCatalogKeyError('barcode', bc);
        }
        seenBarcodes.add(normBc);
      }
    }

    const now = this.clock.now();
    const item = CatalogItem.create({
      ...input,
      now,
      featureProfile: this.features,
    });
    await this.deps.itemRepo.save(item);
    await this.deps.publishEvent?.({
      type: 'CatalogItemSaved',
      itemId: item.id,
      sku: item.sku,
      occurredAt: now.toISOString(),
    });
    return item;
  }

  public async update(rawInput: UpdateCatalogItemInput): Promise<CatalogItem> {
    const input = parseWithCatalogSchema(
      UpdateCatalogItemInputSchema,
      rawInput,
      'update catalog item input'
    );
    if (input.categoryIds && input.categoryIds.length > 0) {
      assertCatalogFeatureEnabled(this.features, 'categories');
    }
    if (input.barcodes && input.barcodes.length > 1) {
      assertCatalogFeatureEnabled(this.features, 'multiBarcodeLookup');
    }
    if (input.taxHint) {
      assertCatalogFeatureEnabled(this.features, 'taxProfileHints');
    }
    if (input.channels && input.channels.length > 1) {
      assertCatalogFeatureEnabled(this.features, 'multiChannelVisibility');
    }

    const item = await this.deps.itemRepo.findById(input.itemId);
    if (!item) throw new CatalogItemNotFoundError(input.itemId);

    if (input.barcodes) {
      const seen = new Set<string>();
      const variantBarcodes = new Set(
        item.variants.flatMap((v) => v.barcodes.map((b) => b.toLowerCase()))
      );
      for (const bc of input.barcodes) {
        const norm = bc.toLowerCase();
        if (seen.has(norm) || variantBarcodes.has(norm)) {
          throw new DuplicateCatalogKeyError('barcode', bc);
        }
        seen.add(norm);
        const existing = await this.deps.itemRepo.findByBarcode(bc);
        if (existing && existing.id !== item.id) {
          throw new DuplicateCatalogKeyError('barcode', bc);
        }
      }
    }

    const now = this.clock.now();
    item.update(input, now);
    const expectedVersion = isCatalogFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.itemRepo.save(item, expectedVersion);
    await this.deps.publishEvent?.({
      type: 'CatalogItemSaved',
      itemId: item.id,
      sku: item.sku,
      occurredAt: now.toISOString(),
    });
    return item;
  }

  public async upsertVariant(
    itemId: string,
    rawVariant: unknown,
    expectedVersion?: number
  ): Promise<CatalogItem> {
    assertCatalogFeatureEnabled(this.features, 'variants');
    const cleanItemId = parseWithCatalogSchema(NonEmptyIdSchema, itemId, 'itemId');
    const parsedExpected = parseWithCatalogSchema(ExpectedVersionSchema, expectedVersion, 'expectedVersion');
    const item = await this.deps.itemRepo.findById(cleanItemId);
    if (!item) throw new CatalogItemNotFoundError(cleanItemId);

    const parsedVariant = parseWithCatalogSchema(CatalogVariantSchema, rawVariant, 'variant');
    const skuMatch = await this.deps.itemRepo.findBySku(parsedVariant.sku);
    if (skuMatch && skuMatch.id !== item.id) {
      throw new DuplicateCatalogKeyError('sku', parsedVariant.sku);
    }
    if (
      item.sku.toLowerCase() === parsedVariant.sku.toLowerCase() ||
      item.variants.some(
        (v) => v.id !== parsedVariant.id && v.sku.toLowerCase() === parsedVariant.sku.toLowerCase()
      )
    ) {
      throw new DuplicateCatalogKeyError('sku', parsedVariant.sku);
    }

    const seenBarcodes = new Set<string>();
    const otherItemBarcodes = new Set([
      ...item.barcodes.map((b) => b.toLowerCase()),
      ...item.variants
        .filter((v) => v.id !== parsedVariant.id)
        .flatMap((v) => v.barcodes.map((b) => b.toLowerCase())),
    ]);
    for (const bc of parsedVariant.barcodes) {
      const norm = bc.toLowerCase();
      if (seenBarcodes.has(norm) || otherItemBarcodes.has(norm)) {
        throw new DuplicateCatalogKeyError('barcode', bc);
      }
      seenBarcodes.add(norm);
      const bcMatch = await this.deps.itemRepo.findByBarcode(bc);
      if (bcMatch && bcMatch.id !== item.id) {
        throw new DuplicateCatalogKeyError('barcode', bc);
      }
    }

    const now = this.clock.now();
    item.upsertVariant(parsedVariant, now);
    await this.deps.itemRepo.save(
      item,
      isCatalogFeatureEnabled(this.features, 'optimisticConcurrency') ? parsedExpected : undefined
    );
    return item;
  }

  public async upsertModifierGroup(
    itemId: string,
    rawGroup: unknown,
    expectedVersion?: number
  ): Promise<CatalogItem> {
    assertCatalogFeatureEnabled(this.features, 'modifiersAndAddons');
    const cleanItemId = parseWithCatalogSchema(NonEmptyIdSchema, itemId, 'itemId');
    const parsedExpected = parseWithCatalogSchema(ExpectedVersionSchema, expectedVersion, 'expectedVersion');
    const item = await this.deps.itemRepo.findById(cleanItemId);
    if (!item) throw new CatalogItemNotFoundError(cleanItemId);

    const now = this.clock.now();
    item.upsertModifierGroup(rawGroup, now);
    await this.deps.itemRepo.save(
      item,
      isCatalogFeatureEnabled(this.features, 'optimisticConcurrency') ? parsedExpected : undefined
    );
    return item;
  }
}
