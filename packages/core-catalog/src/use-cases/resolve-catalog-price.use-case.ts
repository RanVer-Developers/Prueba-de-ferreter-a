import { z } from 'zod';
import {
  ICatalogItemRepository,
  IClock,
  IPriceListRepository,
  IPromotionRepository,
  SystemClock,
} from '../contracts/catalog-contracts.js';
import { SelectedModifierInput } from '../domain/entities/catalog-item.js';
import { CatalogItemNotFoundError } from '../domain/errors/catalog-errors.js';
import {
  CatalogFeatureFlags,
  CatalogFeatureProfile,
  isCatalogFeatureEnabled,
  resolveCatalogFeatures,
} from '../domain/services/catalog-features.js';
import {
  CatalogPricingResolver,
  ResolvedCatalogPrice,
} from '../domain/services/catalog-pricing-resolver.service.js';
import {
  NonEmptyIdSchema,
  SalesChannel,
  SalesChannelSchema,
  parseWithCatalogSchema,
} from '../schemas/catalog.schemas.js';

const SelectedModifierInputSchema = z.object({
  groupId: NonEmptyIdSchema,
  optionId: NonEmptyIdSchema,
  quantity: z.number().int().positive().optional(),
});

const ResolveCatalogPriceRequestSchema = z.object({
  itemId: NonEmptyIdSchema,
  variantId: NonEmptyIdSchema.optional(),
  quantity: z.number().finite().positive().optional(),
  selectedModifiers: z.array(SelectedModifierInputSchema).optional(),
  channel: SalesChannelSchema.optional(),
  customerSegment: z.string().trim().min(1).optional(),
});

export interface ResolveCatalogPriceRequest {
  itemId: string;
  variantId?: string;
  quantity?: number;
  selectedModifiers?: ReadonlyArray<SelectedModifierInput>;
  channel?: SalesChannel;
  customerSegment?: string;
}

export interface ResolveCatalogPriceDeps {
  itemRepo: ICatalogItemRepository;
  priceListRepo?: IPriceListRepository;
  promotionRepo?: IPromotionRepository;
  clock?: IClock;
  featureProfile?: CatalogFeatureProfile;
}

export class ResolveCatalogPriceUseCase {
  private readonly clock: IClock;
  private readonly features: CatalogFeatureFlags;

  constructor(private readonly deps: ResolveCatalogPriceDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCatalogFeatures(deps.featureProfile);
  }

  public async execute(request: ResolveCatalogPriceRequest): Promise<ResolvedCatalogPrice> {
    const parsed = parseWithCatalogSchema(
      ResolveCatalogPriceRequestSchema,
      request,
      'resolve catalog price request'
    );
    const item = await this.deps.itemRepo.findById(parsed.itemId);
    if (!item) {
      throw new CatalogItemNotFoundError(parsed.itemId);
    }

    const priceLists =
      this.deps.priceListRepo && isCatalogFeatureEnabled(this.features, 'priceLists')
        ? await this.deps.priceListRepo.listAll()
        : [];
    const promotions =
      this.deps.promotionRepo && isCatalogFeatureEnabled(this.features, 'promotions')
        ? await this.deps.promotionRepo.listAll()
        : [];

    return CatalogPricingResolver.resolve({
      item,
      variantId: parsed.variantId,
      quantity: parsed.quantity,
      selectedModifiers: parsed.selectedModifiers,
      priceLists,
      promotions,
      channel: parsed.channel,
      customerSegment: parsed.customerSegment,
      now: this.clock.now(),
      features: this.features,
    });
  }
}
