import { describe, expect, it } from 'vitest';
import {
  CatalogItem,
  Category,
  ConcurrencyError,
  CyclicCategoryError,
  DuplicateCatalogKeyError,
  FeatureDisabledError,
  InMemoryCatalogItemRepository,
  InMemoryCategoryRepository,
  InvalidCatalogInputError,
  InvalidModifierSelectionError,
  LookupCatalogUseCase,
  ManageCatalogItemUseCase,
  ManageCategoryUseCase,
} from '../src/index.js';

describe('@modulos/core-catalog: Categories, Items, Variants, Modifiers & Flags', () => {
  it('manages hierarchical categories with cycle detection', async () => {
    const catRepo = new InMemoryCategoryRepository({ isolate: true });
    const manageCat = new ManageCategoryUseCase({ categoryRepo: catRepo });

    await manageCat.create({ id: 'cat-root', slug: 'bebidas', name: 'Bebidas' });
    await manageCat.create({
      id: 'cat-sub',
      slug: 'cafes',
      name: 'Cafés',
      parentId: 'cat-root',
    });

    // Attempting to make cat-root child of cat-sub must throw CyclicCategoryError
    await expect(
      manageCat.update({ categoryId: 'cat-root', parentId: 'cat-sub' })
    ).rejects.toThrow(CyclicCategoryError);
  });

  it('creates items with variants, modifiers, multi-barcodes, and validates selections', async () => {
    const itemRepo = new InMemoryCatalogItemRepository({ isolate: true });
    const manageItem = new ManageCatalogItemUseCase({ itemRepo, featureProfile: 'ADVANCED' });

    const created = await manageItem.create({
      id: 'item-latte',
      sku: 'CAF-LATTE',
      name: 'Café Latte',
      type: 'PHYSICAL',
      categoryIds: ['cat-sub'],
      barcodes: ['7501000000011', 'PLU-101'],
      basePriceCents: 5500,
      variants: [
        {
          id: 'var-med',
          sku: 'CAF-LATTE-M',
          name: 'Mediano 12oz',
          barcodes: ['7501000000028'],
          attributes: { size: 'M' },
          basePriceCents: 5500,
        },
        {
          id: 'var-lg',
          sku: 'CAF-LATTE-L',
          name: 'Grande 16oz',
          barcodes: ['7501000000035'],
          attributes: { size: 'L' },
          basePriceCents: 6800,
        },
      ],
      modifierGroups: [
        {
          id: 'grp-milk',
          name: 'Tipo de leche',
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: 'opt-whole', name: 'Entera', priceDeltaCents: 0, isDefault: true },
            { id: 'opt-oat', name: 'Avena', priceDeltaCents: 1200 },
          ],
        },
        {
          id: 'grp-extras',
          name: 'Extras',
          minSelections: 0,
          maxSelections: 2,
          options: [{ id: 'opt-shot', name: 'Shot extra', priceDeltaCents: 1500, maxQuantity: 2 }],
        },
      ],
      channels: ['POS', 'DELIVERY'],
    });

    expect(created.variants).toHaveLength(2);

    // Duplicate SKU across items or variants fails
    await expect(
      manageItem.create({
        id: 'item-dup',
        sku: 'CAF-LATTE-L',
        name: 'Dup',
        basePriceCents: 100,
      })
    ).rejects.toThrow(DuplicateCatalogKeyError);

    // Lookup by variant barcode finds item + matchedVariant
    const lookup = new LookupCatalogUseCase(itemRepo);
    const found = await lookup.lookupByBarcodeOrSku('7501000000035');
    expect(found?.item.id).toBe('item-latte');
    expect(found?.matchedVariant?.id).toBe('var-lg');

    // Search by channel
    expect(await lookup.search({ channel: 'DELIVERY' })).toHaveLength(1);
    expect(await lookup.search({ channel: 'WHOLESALE' })).toHaveLength(0);

    // Modifier selection validation (missing required milk group)
    expect(() => created.validateModifierSelection([])).toThrow(InvalidModifierSelectionError);

    const modRes = created.validateModifierSelection([
      { groupId: 'grp-milk', optionId: 'opt-oat' },
      { groupId: 'grp-extras', optionId: 'opt-shot', quantity: 2 },
    ]);
    expect(modRes.totalDeltaCents).toBe(4200);

    // Optimistic concurrency check
    await manageItem.update({
      itemId: 'item-latte',
      name: 'Café Latte Artesanal',
      expectedVersion: created.version,
    });
    await expect(
      manageItem.update({ itemId: 'item-latte', name: 'Stale', expectedVersion: 0 })
    ).rejects.toThrow(ConcurrencyError);
  });

  it('enforces BASIC feature flags and validates snapshots with Zod v4', async () => {
    const itemRepo = new InMemoryCatalogItemRepository({ isolate: true });
    const manageBasic = new ManageCatalogItemUseCase({ itemRepo, featureProfile: 'BASIC' });

    await expect(
      manageBasic.create({
        id: 'i-var',
        sku: 'SKU-1',
        name: 'Con variantes',
        basePriceCents: 1000,
        variants: [{ id: 'v1', sku: 'SKU-1-V', name: 'V', basePriceCents: 1000 }],
      })
    ).rejects.toThrow(FeatureDisabledError);

    const item = CatalogItem.create({ id: 'i-snap', sku: 'S1', name: 'Snap', basePriceCents: 500 });
    const snap = item.toSnapshot();
    expect(snap.schemaVersion).toBe(1);
    expect(CatalogItem.fromSnapshot(snap).id).toBe('i-snap');
    expect(() => CatalogItem.fromSnapshot({ ...snap, schemaVersion: 99 })).toThrow(
      InvalidCatalogInputError
    );
    expect(() => Category.fromSnapshot({ id: 'c1', slug: '', name: 'Bad' })).toThrow(
      InvalidCatalogInputError
    );
  });
});
