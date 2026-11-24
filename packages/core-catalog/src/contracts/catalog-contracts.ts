import { CatalogItem } from '../domain/entities/catalog-item.js';
import { Category } from '../domain/entities/category.js';
import { PriceList } from '../domain/entities/price-list.js';
import { PromotionRule } from '../domain/entities/promotion.js';
import { CatalogItemStatus, CatalogItemType, SalesChannel } from '../schemas/catalog.schemas.js';

export interface CatalogSearchFilter {
  query?: string;
  categoryId?: string;
  type?: CatalogItemType;
  status?: CatalogItemStatus;
  channel?: SalesChannel;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface ICatalogItemRepository {
  findById(id: string): Promise<CatalogItem | null>;
  findBySku(sku: string): Promise<CatalogItem | null>;
  findByBarcode(barcode: string): Promise<CatalogItem | null>;
  search(filter?: CatalogSearchFilter): Promise<CatalogItem[]>;
  save(item: CatalogItem, expectedVersion?: number): Promise<void>;
}

export interface ICategoryRepository {
  findById(id: string): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;
  listAll(): Promise<Category[]>;
  save(category: Category, expectedVersion?: number): Promise<void>;
}

export interface IPriceListRepository {
  findById(id: string): Promise<PriceList | null>;
  findByCode(code: string): Promise<PriceList | null>;
  listAll(): Promise<PriceList[]>;
  save(priceList: PriceList, expectedVersion?: number): Promise<void>;
}

export interface IPromotionRepository {
  findById(id: string): Promise<PromotionRule | null>;
  findByCode(code: string): Promise<PromotionRule | null>;
  listAll(): Promise<PromotionRule[]>;
  save(promotion: PromotionRule, expectedVersion?: number): Promise<void>;
}

export interface IClock {
  now(): Date;
}

export const SystemClock: IClock = {
  now: () => new Date(),
};

export type CatalogDomainEvent =
  | { readonly type: 'CatalogCategorySaved'; readonly categoryId: string; readonly occurredAt: string }
  | { readonly type: 'CatalogItemSaved'; readonly itemId: string; readonly sku: string; readonly occurredAt: string }
  | { readonly type: 'CatalogPriceListSaved'; readonly priceListId: string; readonly occurredAt: string }
  | { readonly type: 'CatalogPromotionSaved'; readonly promotionId: string; readonly occurredAt: string };

export type CatalogEventPublisher = (event: CatalogDomainEvent) => Promise<void> | void;
