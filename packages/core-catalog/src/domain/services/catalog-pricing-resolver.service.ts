import { multiplyCentsHalfEven } from '@modulos/core-shared';
import { SalesChannel } from '../../schemas/catalog.schemas.js';
import { CatalogItem, SelectedModifierInput } from '../entities/catalog-item.js';
import { PriceList } from '../entities/price-list.js';
import { PromotionRule } from '../entities/promotion.js';
import {
  InvalidCatalogInputError,
  VariantNotFoundError,
} from '../errors/catalog-errors.js';
import {
  CatalogFeatureFlags,
  isCatalogFeatureEnabled,
} from './catalog-features.js';

export interface ResolvePriceParams {
  item: CatalogItem;
  variantId?: string;
  quantity?: number;
  selectedModifiers?: ReadonlyArray<SelectedModifierInput>;
  priceLists?: ReadonlyArray<PriceList>;
  promotions?: ReadonlyArray<PromotionRule>;
  channel?: SalesChannel;
  customerSegment?: string;
  now?: Date;
  features?: CatalogFeatureFlags;
}

export interface AppliedPromotionDetail {
  readonly promotionId: string;
  readonly code: string;
  readonly name: string;
  readonly discountCents: number;
}

export interface ResolvedCatalogPrice {
  readonly itemId: string;
  readonly variantId?: string;
  readonly currency: string;
  readonly quantity: number;
  readonly baseUnitPriceCents: number;
  readonly appliedPriceListId?: string;
  readonly appliedPriceListCode?: string;
  readonly modifiersUnitDeltaCents: number;
  readonly effectiveUnitPriceCents: number;
  readonly grossSubtotalCents: number;
  readonly promotionDiscountCents: number;
  readonly finalTotalCents: number;
  readonly appliedPromotions: ReadonlyArray<AppliedPromotionDetail>;
}

/**
 * Stateless catalog pricing resolver operating strictly in integer minor units (cents)
 * with @modulos/core-shared ROUND_HALF_EVEN.
 */
export class CatalogPricingResolver {
  public static resolve(params: ResolvePriceParams): ResolvedCatalogPrice {
    const quantity = params.quantity ?? 1;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      throw new InvalidCatalogInputError('quantity must be a positive finite number.');
    }
    if (params.item.status !== 'ACTIVE') {
      throw new InvalidCatalogInputError(
        `Catalog item '${params.item.id}' is not ACTIVE (status: '${params.item.status}').`
      );
    }
    if (params.channel && !params.item.channels.includes(params.channel)) {
      throw new InvalidCatalogInputError(
        `Catalog item '${params.item.id}' is not available in channel '${params.channel}'.`
      );
    }
    if (params.variantId) {
      const variant = params.item.findVariant(params.variantId);
      if (!variant) {
        throw new VariantNotFoundError(params.item.id, params.variantId);
      }
      if (!variant.isActive) {
        throw new InvalidCatalogInputError(
          `Variant '${variant.id}' on item '${params.item.id}' is inactive.`
        );
      }
    }

    const now = params.now ?? new Date();
    const usePriceLists = isCatalogFeatureEnabled(params.features, 'priceLists');
    const useVolumeTiers = isCatalogFeatureEnabled(params.features, 'volumeTierPricing');
    const useModifiers = isCatalogFeatureEnabled(params.features, 'modifiersAndAddons');
    const usePromotions = isCatalogFeatureEnabled(params.features, 'promotions');

    let baseUnitPriceCents = params.item.getEffectiveBasePriceCents(params.variantId);
    let appliedPriceListId: string | undefined;
    let appliedPriceListCode: string | undefined;

    if (usePriceLists && params.priceLists && params.priceLists.length > 0) {
      const sortedLists = [...params.priceLists]
        .filter(
          (pl) =>
            pl.currency === params.item.currency &&
            pl.isApplicable({
              channel: params.channel,
              customerSegment: params.customerSegment,
              now,
            })
        )
        .sort((a, b) => b.priority - a.priority);

      for (const pl of sortedLists) {
        const resolved = pl.resolveUnitPriceCents({
          itemId: params.item.id,
          variantId: params.variantId,
          quantity,
          enableVolumeTiers: useVolumeTiers,
        });
        if (resolved !== undefined) {
          baseUnitPriceCents = resolved;
          appliedPriceListId = pl.id;
          appliedPriceListCode = pl.code;
          break;
        }
      }
    }

    const modifiersResult = useModifiers
      ? params.item.validateModifierSelection(params.selectedModifiers ?? [])
      : { totalDeltaCents: 0, selectedDetails: [] };

    const effectiveUnitPriceCents = Math.max(
      0,
      baseUnitPriceCents + modifiersResult.totalDeltaCents
    );
    const grossSubtotalCents = multiplyCentsHalfEven(effectiveUnitPriceCents, quantity);

    let remainingGross = grossSubtotalCents;
    let promotionDiscountCents = 0;
    const appliedPromotions: AppliedPromotionDetail[] = [];

    if (usePromotions && params.promotions && params.promotions.length > 0) {
      const eligible = [...params.promotions]
        .filter((p) =>
          p.matches({
            itemId: params.item.id,
            categoryIds: params.item.categoryIds,
            quantity,
            currency: params.item.currency,
            channel: params.channel,
            customerSegment: params.customerSegment,
            now,
          })
        )
        .sort((a, b) => b.priority - a.priority);

      for (const promo of eligible) {
        if (remainingGross <= 0) break;
        if (!promo.stackable && appliedPromotions.length > 0) {
          continue;
        }
        const discount = promo.calculateDiscountCents({
          unitPriceCents: effectiveUnitPriceCents,
          quantity,
          remainingGrossCents: remainingGross,
        });
        if (discount > 0) {
          remainingGross -= discount;
          promotionDiscountCents += discount;
          appliedPromotions.push({
            promotionId: promo.id,
            code: promo.code,
            name: promo.name,
            discountCents: discount,
          });
          if (!promo.stackable) {
            break;
          }
        }
      }
    }

    return {
      itemId: params.item.id,
      variantId: params.variantId,
      currency: params.item.currency,
      quantity,
      baseUnitPriceCents,
      appliedPriceListId,
      appliedPriceListCode,
      modifiersUnitDeltaCents: modifiersResult.totalDeltaCents,
      effectiveUnitPriceCents,
      grossSubtotalCents,
      promotionDiscountCents,
      finalTotalCents: Math.max(0, grossSubtotalCents - promotionDiscountCents),
      appliedPromotions,
    };
  }
}
