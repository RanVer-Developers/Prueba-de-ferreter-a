import {
  CatalogSearchFilter,
  ICatalogItemRepository,
  ICategoryRepository,
  IPriceListRepository,
  IPromotionRepository,
} from '../../contracts/catalog-contracts.js';
import { CatalogItem } from '../../domain/entities/catalog-item.js';
import { Category } from '../../domain/entities/category.js';
import { PriceList } from '../../domain/entities/price-list.js';
import { PromotionRule } from '../../domain/entities/promotion.js';
import { ConcurrencyError } from '../../domain/errors/catalog-errors.js';
import {
  CatalogItemSnapshot,
  CategorySnapshot,
  PriceListSnapshot,
  PromotionSnapshot,
} from '../../schemas/catalog.schemas.js';

export interface InMemoryRepoOptions {
  isolate?: boolean;
}

export class InMemoryCatalogItemRepository implements ICatalogItemRepository {
  private readonly items = new Map<string, CatalogItem>();
  private readonly snapshots = new Map<string, CatalogItemSnapshot>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepoOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  private clone(item: CatalogItem): CatalogItem {
    return CatalogItem.fromSnapshot(JSON.parse(JSON.stringify(item.toSnapshot())));
  }

  private all(): CatalogItem[] {
    if (this.isolate) {
      return Array.from(this.snapshots.values()).map((s) =>
        CatalogItem.fromSnapshot(JSON.parse(JSON.stringify(s)))
      );
    }
    return Array.from(this.items.values());
  }

  public async findById(id: string): Promise<CatalogItem | null> {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? CatalogItem.fromSnapshot(JSON.parse(JSON.stringify(snap))) : null;
    }
    return this.items.get(id) ?? null;
  }

  public async findBySku(sku: string): Promise<CatalogItem | null> {
    const norm = sku.trim().toLowerCase();
    for (const item of this.all()) {
      if (item.sku.toLowerCase() === norm) return item;
      if (item.variants.some((v) => v.sku.toLowerCase() === norm)) return item;
    }
    return null;
  }

  public async findByBarcode(barcode: string): Promise<CatalogItem | null> {
    const norm = barcode.trim().toLowerCase();
    for (const item of this.all()) {
      if (item.getAllBarcodes().some((b) => b.toLowerCase() === norm)) return item;
    }
    return null;
  }

  public async search(filter: CatalogSearchFilter = {}): Promise<CatalogItem[]> {
    const q = filter.query?.trim().toLowerCase();
    const filtered = this.all().filter((item) => {
      if (filter.status && item.status !== filter.status) return false;
      if (filter.type && item.type !== filter.type) return false;
      if (filter.categoryId && !item.categoryIds.includes(filter.categoryId)) return false;
      if (filter.channel && !item.channels.includes(filter.channel)) return false;
      if (filter.tag && !item.tags.includes(filter.tag)) return false;
      if (q) {
        const hay = [item.id, item.sku, item.name, ...item.getAllBarcodes()].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = Math.max(1, filter.limit ?? 50);
    return filtered.slice(offset, offset + limit);
  }

  public async save(item: CatalogItem, expectedVersion?: number): Promise<void> {
    if (this.isolate) {
      const existing = this.snapshots.get(item.id);
      const expected = expectedVersion ?? item.persistedVersion;
      if (existing && existing.version !== expected) {
        throw new ConcurrencyError('CatalogItem', item.id, expected, existing.version);
      }
      this.snapshots.set(item.id, JSON.parse(JSON.stringify(item.toSnapshot())));
      item.markPersisted();
      return;
    }
    this.items.set(item.id, this.clone(item));
    item.markPersisted();
  }
}

export class InMemoryCategoryRepository implements ICategoryRepository {
  private readonly items = new Map<string, Category>();
  private readonly snapshots = new Map<string, CategorySnapshot>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepoOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  public async findById(id: string): Promise<Category | null> {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? Category.fromSnapshot(JSON.parse(JSON.stringify(snap))) : null;
    }
    return this.items.get(id) ?? null;
  }

  public async findBySlug(slug: string): Promise<Category | null> {
    const norm = slug.trim().toLowerCase();
    for (const c of await this.listAll()) {
      if (c.slug.toLowerCase() === norm) return c;
    }
    return null;
  }

  public async listAll(): Promise<Category[]> {
    if (this.isolate) {
      return Array.from(this.snapshots.values()).map((s) =>
        Category.fromSnapshot(JSON.parse(JSON.stringify(s)))
      );
    }
    return Array.from(this.items.values());
  }

  public async save(category: Category, expectedVersion?: number): Promise<void> {
    if (this.isolate) {
      const existing = this.snapshots.get(category.id);
      const expected = expectedVersion ?? category.persistedVersion;
      if (existing && existing.version !== expected) {
        throw new ConcurrencyError('Category', category.id, expected, existing.version);
      }
      this.snapshots.set(category.id, JSON.parse(JSON.stringify(category.toSnapshot())));
      category.markPersisted();
      return;
    }
    this.items.set(category.id, Category.fromSnapshot(JSON.parse(JSON.stringify(category.toSnapshot()))));
    category.markPersisted();
  }
}

export class InMemoryPriceListRepository implements IPriceListRepository {
  private readonly items = new Map<string, PriceList>();
  private readonly snapshots = new Map<string, PriceListSnapshot>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepoOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  public async findById(id: string): Promise<PriceList | null> {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? PriceList.fromSnapshot(JSON.parse(JSON.stringify(snap))) : null;
    }
    return this.items.get(id) ?? null;
  }

  public async findByCode(code: string): Promise<PriceList | null> {
    const norm = code.trim().toUpperCase();
    for (const pl of await this.listAll()) {
      if (pl.code === norm) return pl;
    }
    return null;
  }

  public async listAll(): Promise<PriceList[]> {
    if (this.isolate) {
      return Array.from(this.snapshots.values()).map((s) =>
        PriceList.fromSnapshot(JSON.parse(JSON.stringify(s)))
      );
    }
    return Array.from(this.items.values());
  }

  public async save(priceList: PriceList, expectedVersion?: number): Promise<void> {
    if (this.isolate) {
      const existing = this.snapshots.get(priceList.id);
      const expected = expectedVersion ?? priceList.persistedVersion;
      if (existing && existing.version !== expected) {
        throw new ConcurrencyError('PriceList', priceList.id, expected, existing.version);
      }
      this.snapshots.set(priceList.id, JSON.parse(JSON.stringify(priceList.toSnapshot())));
      priceList.markPersisted();
      return;
    }
    this.items.set(priceList.id, PriceList.fromSnapshot(JSON.parse(JSON.stringify(priceList.toSnapshot()))));
    priceList.markPersisted();
  }
}

export class InMemoryPromotionRepository implements IPromotionRepository {
  private readonly items = new Map<string, PromotionRule>();
  private readonly snapshots = new Map<string, PromotionSnapshot>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepoOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  public async findById(id: string): Promise<PromotionRule | null> {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? PromotionRule.fromSnapshot(JSON.parse(JSON.stringify(snap))) : null;
    }
    return this.items.get(id) ?? null;
  }

  public async findByCode(code: string): Promise<PromotionRule | null> {
    const norm = code.trim().toUpperCase();
    for (const p of await this.listAll()) {
      if (p.code === norm) return p;
    }
    return null;
  }

  public async listAll(): Promise<PromotionRule[]> {
    if (this.isolate) {
      return Array.from(this.snapshots.values()).map((s) =>
        PromotionRule.fromSnapshot(JSON.parse(JSON.stringify(s)))
      );
    }
    return Array.from(this.items.values());
  }

  public async save(promotion: PromotionRule, expectedVersion?: number): Promise<void> {
    if (this.isolate) {
      const existing = this.snapshots.get(promotion.id);
      const expected = expectedVersion ?? promotion.persistedVersion;
      if (existing && existing.version !== expected) {
        throw new ConcurrencyError('PromotionRule', promotion.id, expected, existing.version);
      }
      this.snapshots.set(promotion.id, JSON.parse(JSON.stringify(promotion.toSnapshot())));
      promotion.markPersisted();
      return;
    }
    this.items.set(
      promotion.id,
      PromotionRule.fromSnapshot(JSON.parse(JSON.stringify(promotion.toSnapshot())))
    );
    promotion.markPersisted();
  }
}
