import { describe, expect, it } from 'vitest';
import {
  CatalogItem,
  CatalogPricingResolver,
  ConcurrencyError,
  DuplicateCatalogKeyError,
  FeatureDisabledError,
  InMemoryCatalogItemRepository,
  InvalidCatalogInputError,
  ManageCatalogItemUseCase,
  PromotionRule,
} from '../src/index.js';

describe('@modulos/core-catalog Audit Remediation Tests', () => {
  it('defaults InMemoryCatalogItemRepository to isolate: true and enforces concurrency', async () => {
    const repo = new InMemoryCatalogItemRepository();
    await new ManageCatalogItemUseCase({ itemRepo: repo }).create({
      id: 'it-iso',
      sku: 'ISO-1',
      name: 'Café',
      basePriceCents: 1000,
    });

    const a = (await repo.findById('it-iso'))!;
    const b = (await repo.findById('it-iso'))!;
    a.update({ name: 'Café A' });
    await repo.save(a);

    b.update({ name: 'Café B' });
    await expect(repo.save(b)).rejects.toThrow(ConcurrencyError);
  });

  it('validates PromotionRule.fromSnapshot invariants and FIXED_AMOUNT currency compatibility', () => {
    const badSnapshot = {
      ...PromotionRule.create({
        id: 'p1',
        code: 'P1',
        name: 'P1',
        type: 'PERCENTAGE',
        value: 10,
      }).toSnapshot(),
      value: 150,
    };
    expect(() => PromotionRule.fromSnapshot(badSnapshot)).toThrow(InvalidCatalogInputError);

    const usdPromo = PromotionRule.create({
      id: 'p-usd',
      code: 'USD100',
      name: '1 USD off',
      type: 'FIXED_AMOUNT',
      value: 100,
      currency: 'USD',
    });
    const mxnItem = CatalogItem.create({
      id: 'it-mxn',
      sku: 'MXN-1',
      name: 'Agua',
      currency: 'MXN',
      basePriceCents: 1500,
    });
    const res = CatalogPricingResolver.resolve({ item: mxnItem, promotions: [usdPromo] });
    expect(res.promotionDiscountCents).toBe(0);
    expect(res.finalTotalCents).toBe(1500);
  });

  it('enforces ACTIVE status, channel visibility, active variant, and stackable: false exclusion', () => {
    const inactiveItem = CatalogItem.create({
      id: 'it-draft',
      sku: 'DRAFT-1',
      name: 'Borrador',
      status: 'DRAFT',
      basePriceCents: 1000,
    });
    expect(() => CatalogPricingResolver.resolve({ item: inactiveItem })).toThrow(InvalidCatalogInputError);

    const activeItem = CatalogItem.create({
      id: 'it-act',
      sku: 'ACT-1',
      name: 'Té',
      basePriceCents: 1000,
      channels: ['POS'],
      variants: [{ id: 'v-off', sku: 'ACT-1-OFF', name: 'Off', basePriceCents: 1000, isActive: false, barcodes: [], attributes: {}, sortOrder: 0 }],
      featureProfile: 'ADVANCED',
    });
    expect(() => CatalogPricingResolver.resolve({ item: activeItem, channel: 'WEB' })).toThrow(
      InvalidCatalogInputError
    );
    expect(() => CatalogPricingResolver.resolve({ item: activeItem, variantId: 'v-off' })).toThrow(
      InvalidCatalogInputError
    );

    const stackableFirst = PromotionRule.create({
      id: 'p-st',
      code: 'STACK10',
      name: '10%',
      type: 'PERCENTAGE',
      value: 10,
      priority: 20,
      stackable: true,
    });
    const nonStackableLower = PromotionRule.create({
      id: 'p-nost',
      code: 'NOSTACK',
      name: '500 off',
      type: 'FIXED_AMOUNT',
      value: 500,
      priority: 5,
      stackable: false,
    });
    const resolved = CatalogPricingResolver.resolve({
      item: activeItem,
      promotions: [stackableFirst, nonStackableLower],
    });
    expect(resolved.appliedPromotions.map((p) => p.code)).toEqual(['STACK10']);
    expect(resolved.finalTotalCents).toBe(900);
  });

  it('blocks duplicate variant SKUs and enforces feature flags on update', async () => {
    const repo = new InMemoryCatalogItemRepository();
    const adv = new ManageCatalogItemUseCase({ itemRepo: repo, featureProfile: 'ADVANCED' });
    await expect(
      adv.create({
        id: 'it-var-dup',
        sku: 'BASE-1',
        name: 'Dup',
        basePriceCents: 1000,
        variants: [{ id: 'v1', sku: 'BASE-1', name: 'Same as base', basePriceCents: 1000 }],
      })
    ).rejects.toThrow(DuplicateCatalogKeyError);

    const basic = new ManageCatalogItemUseCase({ itemRepo: repo, featureProfile: 'BASIC' });
    await basic.create({ id: 'it-b', sku: 'B-1', name: 'Básico', basePriceCents: 500 });
    await expect(
      basic.update({ itemId: 'it-b', barcodes: ['111', '222'] })
    ).rejects.toThrow(FeatureDisabledError);
  });
});
