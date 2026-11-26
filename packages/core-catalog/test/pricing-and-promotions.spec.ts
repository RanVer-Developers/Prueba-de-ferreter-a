import { describe, expect, it } from 'vitest';
import {
  FeatureDisabledError,
  InMemoryCatalogItemRepository,
  InMemoryPriceListRepository,
  InMemoryPromotionRepository,
  ManageCatalogItemUseCase,
  ManagePricingCatalogUseCase,
  PriceList,
  PromotionRule,
  ResolveCatalogPriceUseCase,
} from '../src/index.js';

class ManualClock {
  private ms: number;
  constructor(iso = '2026-11-19T12:00:00.000Z') {
    this.ms = new Date(iso).getTime();
  }
  now(): Date {
    return new Date(this.ms);
  }
  advanceDays(days: number): void {
    this.ms += days * 86_400_000;
  }
}

describe('@modulos/core-catalog: Price Lists, Volume Tiers & Promotions', () => {
  it('resolves priority price lists, volume tiers, modifiers, and stackable/non-stackable promos', async () => {
    const itemRepo = new InMemoryCatalogItemRepository({ isolate: true });
    const priceListRepo = new InMemoryPriceListRepository({ isolate: true });
    const promotionRepo = new InMemoryPromotionRepository({ isolate: true });
    const clock = new ManualClock();

    const manageItem = new ManageCatalogItemUseCase({ itemRepo, clock });
    const managePricing = new ManagePricingCatalogUseCase({
      priceListRepo,
      promotionRepo,
      clock,
      featureProfile: 'ADVANCED',
    });

    await manageItem.create({
      id: 'item-tshirt',
      sku: 'TSHIRT',
      name: 'Playera Algodón',
      categoryIds: ['cat-apparel'],
      basePriceCents: 20_000, // $200.00
      variants: [
        {
          id: 'var-xl',
          sku: 'TSHIRT-XL',
          name: 'XL',
          basePriceCents: 22_000, // $220.00
        },
      ],
      modifierGroups: [
        {
          id: 'grp-print',
          name: 'Estampado',
          minSelections: 0,
          maxSelections: 1,
          options: [{ id: 'opt-logo', name: 'Logo bordado', priceDeltaCents: 3000 }],
        },
      ],
    });

    await managePricing.createPriceList({
      id: 'pl-wholesale',
      code: 'MAYOREO',
      name: 'Lista Mayoreo',
      priority: 10,
      channels: ['WHOLESALE', 'POS'],
      customerSegments: ['WHOLESALE'],
      entries: [
        {
          itemId: 'item-tshirt',
          variantId: 'var-xl',
          unitPriceCents: 18_000,
          volumeTiers: [
            { minQuantity: 10, unitPriceCents: 15_000 },
            { minQuantity: 50, unitPriceCents: 12_000 },
          ],
        },
      ],
    });

    // Stackable 10% promo + stackable BUY_X_GET_Y lower priority
    await managePricing.createPromotion({
      id: 'promo-10',
      code: 'APPAREL10',
      name: '10% en Ropa',
      type: 'PERCENTAGE',
      value: 10,
      targetCategoryIds: ['cat-apparel'],
      priority: 20,
      stackable: true,
    });
    await managePricing.createPromotion({
      id: 'promo-2x1',
      code: '2X1',
      name: 'Compra 2 lleva 1 gratis',
      type: 'BUY_X_GET_Y',
      buyQuantity: 2,
      getQuantity: 1,
      targetItemIds: ['item-tshirt'],
      priority: 5,
      stackable: true,
    });

    const resolve = new ResolveCatalogPriceUseCase({
      itemRepo,
      priceListRepo,
      promotionRepo,
      clock,
      featureProfile: 'ADVANCED',
    });

    // Qty 12 on WHOLESALE segment hits 10+ tier ($150.00) + $30.00 modifier = $180.00 unit * 12 = $2,160.00 (216_000)
    // Promo 10% (21_600) leaves 194_400; then 2X1 (buy 2 get 1 => 4 free units out of 12 => 4 * 18_000 = 72_000)
    const quote = await resolve.execute({
      itemId: 'item-tshirt',
      variantId: 'var-xl',
      quantity: 12,
      selectedModifiers: [{ groupId: 'grp-print', optionId: 'opt-logo' }],
      channel: 'POS',
      customerSegment: 'WHOLESALE',
    });

    expect(quote.appliedPriceListCode).toBe('MAYOREO');
    expect(quote.baseUnitPriceCents).toBe(15_000);
    expect(quote.effectiveUnitPriceCents).toBe(18_000);
    expect(quote.grossSubtotalCents).toBe(216_000);
    expect(quote.promotionDiscountCents).toBe(21_600 + 72_000);
    expect(quote.finalTotalCents).toBe(122_400);
    expect(quote.appliedPromotions).toHaveLength(2);
  });

  it('respects validity windows and feature flags (volumeTierPricing disabled in INTERMEDIATE)', async () => {
    const priceListRepo = new InMemoryPriceListRepository({ isolate: true });
    const manageIntermediate = new ManagePricingCatalogUseCase({
      priceListRepo,
      featureProfile: 'INTERMEDIATE',
    });

    await expect(
      manageIntermediate.createPriceList({
        id: 'pl-1',
        code: 'P1',
        name: 'Tiered',
        entries: [
          {
            itemId: 'i1',
            unitPriceCents: 1000,
            volumeTiers: [{ minQuantity: 5, unitPriceCents: 800 }],
          },
        ],
      })
    ).rejects.toThrow(FeatureDisabledError);

    const promo = PromotionRule.create({
      id: 'pr-exp',
      code: 'FLASH',
      name: 'Flash',
      type: 'FIXED_AMOUNT',
      value: 500,
      validFrom: new Date('2026-11-10T00:00:00Z'),
      validTo: new Date('2026-11-12T00:00:00Z'),
    });
    expect(
      promo.matches({
        itemId: 'i1',
        categoryIds: [],
        quantity: 1,
        now: new Date('2026-11-11T00:00:00Z'),
      })
    ).toBe(true);
    expect(
      promo.matches({
        itemId: 'i1',
        categoryIds: [],
        quantity: 1,
        now: new Date('2026-11-15T00:00:00Z'),
      })
    ).toBe(false);

    const plSnap = PriceList.create({ id: 'pl-s', code: 'S', name: 'S' }).toSnapshot();
    expect(plSnap.schemaVersion).toBe(1);
    expect(PriceList.fromSnapshot(plSnap).code).toBe('S');
  });
});
