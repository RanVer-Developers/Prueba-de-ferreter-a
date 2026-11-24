import { z } from 'zod';
import { CatalogSearchFilter, ICatalogItemRepository } from '../contracts/catalog-contracts.js';
import { CatalogItem } from '../domain/entities/catalog-item.js';
import {
  CatalogItemStatusSchema,
  CatalogItemTypeSchema,
  CatalogVariant,
  NonEmptyIdSchema,
  SalesChannelSchema,
  parseWithCatalogSchema,
} from '../schemas/catalog.schemas.js';

const CatalogSearchFilterSchema = z.object({
  query: z.string().trim().optional(),
  status: CatalogItemStatusSchema.optional(),
  type: CatalogItemTypeSchema.optional(),
  categoryId: NonEmptyIdSchema.optional(),
  channel: SalesChannelSchema.optional(),
  tag: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

const CodeLookupInputSchema = z.string();

export interface CodeLookupResult {
  readonly item: CatalogItem;
  readonly matchedVariant?: CatalogVariant;
}

export class LookupCatalogUseCase {
  constructor(private readonly itemRepo: ICatalogItemRepository) {}

  public async search(filter: CatalogSearchFilter = {}): Promise<CatalogItem[]> {
    const parsed = parseWithCatalogSchema(CatalogSearchFilterSchema, filter, 'catalog search filter');
    return this.itemRepo.search(parsed);
  }

  public async lookupByBarcodeOrSku(code: string): Promise<CodeLookupResult | null> {
    const parsedCode = parseWithCatalogSchema(CodeLookupInputSchema, code, 'lookup code');
    const trimmed = parsedCode.trim();
    if (!trimmed) return null;

    const byBarcode = await this.itemRepo.findByBarcode(trimmed);
    if (byBarcode) {
      return {
        item: byBarcode,
        matchedVariant: byBarcode.findVariantByCode(trimmed),
      };
    }

    const bySku = await this.itemRepo.findBySku(trimmed);
    if (bySku) {
      return {
        item: bySku,
        matchedVariant: bySku.findVariantByCode(trimmed),
      };
    }

    return null;
  }
}
