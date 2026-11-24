import { z } from 'zod';
import {
  CatalogEventPublisher,
  IClock,
  IPriceListRepository,
  IPromotionRepository,
  SystemClock,
} from '../contracts/catalog-contracts.js';
import { PriceList } from '../domain/entities/price-list.js';
import { PromotionRule } from '../domain/entities/promotion.js';
import {
  DuplicateCatalogKeyError,
  PriceListNotFoundError,
} from '../domain/errors/catalog-errors.js';
import {
  CatalogFeatureFlags,
  CatalogFeatureProfile,
  assertCatalogFeatureEnabled,
  isCatalogFeatureEnabled,
  resolveCatalogFeatures,
} from '../domain/services/catalog-features.js';
import {
  CurrencyCodeSchema,
  NonEmptyIdSchema,
  PriceListEntrySchema,
  PromotionTypeSchema,
  SalesChannelSchema,
  parseWithCatalogSchema,
} from '../schemas/catalog.schemas.js';

const CreatePriceListInputSchema = z.object({
  id: NonEmptyIdSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  currency: CurrencyCodeSchema.default('MXN'),
  priority: z.number().int().default(0),
  channels: z.array(SalesChannelSchema).optional(),
  customerSegments: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().default(true),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
  entries: z.array(PriceListEntrySchema).optional(),
});

const CreatePromotionInputSchema = z.object({
  id: NonEmptyIdSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: PromotionTypeSchema,
  value: z.number().finite().min(0).default(0),
  currency: CurrencyCodeSchema.optional(),
  buyQuantity: z.number().int().positive().optional(),
  getQuantity: z.number().int().positive().optional(),
  targetItemIds: z.array(NonEmptyIdSchema).optional(),
  targetCategoryIds: z.array(NonEmptyIdSchema).optional(),
  channels: z.array(SalesChannelSchema).optional(),
  customerSegments: z.array(z.string().trim().min(1)).optional(),
  minQuantity: z.number().finite().positive().default(1),
  priority: z.number().int().default(0),
  stackable: z.boolean().default(false),
  isActive: z.boolean().default(true),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
});

const ExpectedVersionSchema = z.number().int().min(0).optional();

export type CreatePriceListInput = z.input<typeof CreatePriceListInputSchema>;
export type CreatePromotionInput = z.input<typeof CreatePromotionInputSchema>;

export interface ManagePricingCatalogDeps {
  priceListRepo: IPriceListRepository;
  promotionRepo?: IPromotionRepository;
  publishEvent?: CatalogEventPublisher;
  clock?: IClock;
  featureProfile?: CatalogFeatureProfile;
}

export class ManagePricingCatalogUseCase {
  private readonly clock: IClock;
  private readonly features: CatalogFeatureFlags;

  constructor(private readonly deps: ManagePricingCatalogDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCatalogFeatures(deps.featureProfile);
  }

  public async createPriceList(rawInput: CreatePriceListInput): Promise<PriceList> {
    assertCatalogFeatureEnabled(this.features, 'priceLists');
    const input = parseWithCatalogSchema(
      CreatePriceListInputSchema,
      rawInput,
      'create price list input'
    );
    if (input.entries?.some((e) => e.volumeTiers.length > 0)) {
      assertCatalogFeatureEnabled(this.features, 'volumeTierPricing');
    }

    if (await this.deps.priceListRepo.findById(input.id)) {
      throw new DuplicateCatalogKeyError('id', input.id);
    }
    if (await this.deps.priceListRepo.findByCode(input.code)) {
      throw new DuplicateCatalogKeyError('code', input.code);
    }

    const now = this.clock.now();
    const pl = PriceList.create({ ...input, now });
    await this.deps.priceListRepo.save(pl);
    await this.deps.publishEvent?.({
      type: 'CatalogPriceListSaved',
      priceListId: pl.id,
      occurredAt: now.toISOString(),
    });
    return pl;
  }

  public async upsertPriceEntry(
    priceListId: string,
    rawEntry: unknown,
    expectedVersion?: number
  ): Promise<PriceList> {
    assertCatalogFeatureEnabled(this.features, 'priceLists');
    const cleanId = parseWithCatalogSchema(NonEmptyIdSchema, priceListId, 'priceListId');
    const parsedExpected = parseWithCatalogSchema(ExpectedVersionSchema, expectedVersion, 'expectedVersion');
    const entry = parseWithCatalogSchema(PriceListEntrySchema, rawEntry, 'price list entry');
    if (entry.volumeTiers.length > 0) {
      assertCatalogFeatureEnabled(this.features, 'volumeTierPricing');
    }

    const pl = await this.deps.priceListRepo.findById(cleanId);
    if (!pl) throw new PriceListNotFoundError(cleanId);

    const now = this.clock.now();
    pl.upsertEntry(entry, now);
    await this.deps.priceListRepo.save(
      pl,
      isCatalogFeatureEnabled(this.features, 'optimisticConcurrency') ? parsedExpected : undefined
    );
    await this.deps.publishEvent?.({
      type: 'CatalogPriceListSaved',
      priceListId: pl.id,
      occurredAt: now.toISOString(),
    });
    return pl;
  }

  public async createPromotion(rawInput: CreatePromotionInput): Promise<PromotionRule> {
    assertCatalogFeatureEnabled(this.features, 'promotions');
    if (!this.deps.promotionRepo) {
      throw new PriceListNotFoundError('promotionRepo is not configured');
    }
    const input = parseWithCatalogSchema(
      CreatePromotionInputSchema,
      rawInput,
      'create promotion input'
    );

    if (await this.deps.promotionRepo.findById(input.id)) {
      throw new DuplicateCatalogKeyError('id', input.id);
    }
    if (await this.deps.promotionRepo.findByCode(input.code)) {
      throw new DuplicateCatalogKeyError('code', input.code);
    }

    const now = this.clock.now();
    const promo = PromotionRule.create({ ...input, now });
    await this.deps.promotionRepo.save(promo);
    await this.deps.publishEvent?.({
      type: 'CatalogPromotionSaved',
      promotionId: promo.id,
      occurredAt: now.toISOString(),
    });
    return promo;
  }
}
