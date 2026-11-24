import { InventoryItem } from '../domain/entities/inventory-item.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import {
  ABCClass,
  ABCClassificationService,
} from '../domain/services/abc-classification.service.js';
import {
  InventoryFeatureFlags,
  InventoryFeatureProfile,
  assertInventoryFeatureEnabled,
  resolveInventoryFeatures,
} from '../domain/services/inventory-features.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';

export type ReplenishmentUrgency = 'OUT_OF_STOCK' | 'BELOW_MIN' | 'REORDER_POINT';

export interface ReplenishmentSuggestion {
  readonly itemId: string;
  readonly sku: string;
  readonly name: string;
  readonly warehouseId: string;
  readonly available: number;
  readonly inTransit: number;
  readonly effectivePosition: number;
  readonly minStock: number;
  readonly reorderPoint: number;
  readonly maxStock?: number;
  readonly suggestedOrderQuantity: number;
  readonly urgency: ReplenishmentUrgency;
}

export class GetReplenishmentSuggestionsUseCase {
  private readonly features: InventoryFeatureFlags;

  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    featureProfile?: InventoryFeatureProfile
  ) {
    this.features = resolveInventoryFeatures(featureProfile);
  }

  public async execute(params: { warehouseId?: string } = {}): Promise<ReplenishmentSuggestion[]> {
    assertInventoryFeatureEnabled(this.features, 'replenishmentSuggestions');
    const items = await this.itemRepo.listAll();
    const suggestions: ReplenishmentSuggestion[] = [];

    for (const item of items) {
      const json = item.toJSON();
      for (const [whId, stock] of Object.entries(json.stocks)) {
        if (params.warehouseId && whId !== params.warehouseId) continue;

        const rules = item.getReorderRules(whId);
        const available = stock.onHand - stock.reserved;
        const effectivePosition = available + stock.inTransit;

        if (effectivePosition > rules.reorderPoint) continue;

        const targetStock = rules.maxStock ?? Math.max(rules.reorderPoint * 2, rules.minStock);
        const suggestedOrderQuantity = Math.max(0, targetStock - effectivePosition);
        if (suggestedOrderQuantity <= 0) continue;

        const urgency: ReplenishmentUrgency =
          available <= 0
            ? 'OUT_OF_STOCK'
            : effectivePosition < rules.minStock
              ? 'BELOW_MIN'
              : 'REORDER_POINT';

        suggestions.push({
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          warehouseId: whId,
          available,
          inTransit: stock.inTransit,
          effectivePosition,
          minStock: rules.minStock,
          reorderPoint: rules.reorderPoint,
          maxStock: rules.maxStock,
          suggestedOrderQuantity,
          urgency,
        });
      }
    }

    const urgencyRank: Record<ReplenishmentUrgency, number> = {
      OUT_OF_STOCK: 0,
      BELOW_MIN: 1,
      REORDER_POINT: 2,
    };
    return suggestions.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);
  }
}

export interface ExpiredLotRecord {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly lotNumber: string;
  readonly quantityAffected: number;
}

export class ExpireLotsUseCase {
  private readonly features: InventoryFeatureFlags;

  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly eventBus?: IInventoryEventBus,
    featureProfile?: InventoryFeatureProfile
  ) {
    this.features = resolveInventoryFeatures(featureProfile);
  }

  public async execute(params: {
    warehouseId?: string;
    referenceDate?: Date;
    reason?: string;
  } = {}): Promise<ExpiredLotRecord[]> {
    assertInventoryFeatureEnabled(this.features, 'batchLots');
    assertInventoryFeatureEnabled(this.features, 'autoExpireLots');

    const refDate = params.referenceDate ?? new Date();
    const items = await this.itemRepo.listAll();
    const expiredRecords: ExpiredLotRecord[] = [];

    for (const item of items) {
      if (item.trackingType !== 'BATCH_LOT') continue;
      const json = item.toJSON();
      let modified = false;

      for (const whId of Object.keys(json.stocks)) {
        if (params.warehouseId && whId !== params.warehouseId) continue;
        const stockData = item.getWarehouseStock(whId);
        if (!stockData) continue;

        for (const lot of stockData.lots) {
          if (lot.status === 'ACTIVE' && lot.isExpired(refDate)) {
            item.setLotStatus({
              warehouseId: whId,
              lotNumber: lot.lotNumber,
              status: 'EXPIRED',
              reason: params.reason ?? 'Auto-expired past expiration date',
            });
            expiredRecords.push({
              itemId: item.id,
              warehouseId: whId,
              lotNumber: lot.lotNumber,
              quantityAffected: lot.currentQuantity,
            });
            modified = true;
          }
        }
      }

      if (modified) {
        await this.itemRepo.save(item);
        if (this.eventBus) {
          const events = item.pullDomainEvents();
          if (events.length > 0) await this.eventBus.publish(events);
        }
      }
    }

    return expiredRecords;
  }
}

export class SelectCycleCountItemsUseCase {
  private readonly features: InventoryFeatureFlags;

  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    featureProfile?: InventoryFeatureProfile
  ) {
    this.features = resolveInventoryFeatures(featureProfile);
  }

  public async execute(params: {
    warehouseId: string;
    targetClasses?: ABCClass[];
    aisle?: string;
  }): Promise<InventoryItem[]> {
    assertInventoryFeatureEnabled(this.features, 'cycleCounting');
    const allItems = await this.itemRepo.listAll();

    let allowedIds: Set<string> | undefined;
    if (params.targetClasses && params.targetClasses.length > 0) {
      assertInventoryFeatureEnabled(this.features, 'abcClassification');
      const analysis = ABCClassificationService.analyze(allItems, params.warehouseId);
      const classSet = new Set(params.targetClasses);
      allowedIds = new Set(
        analysis.items.filter((c) => classSet.has(c.abcClass)).map((c) => c.itemId)
      );
    }

    return allItems.filter((item) => {
      if (allowedIds && !allowedIds.has(item.id)) return false;
      const stock = item.getWarehouseStock(params.warehouseId);
      if (!stock) return false;
      if (params.aisle) {
        const normAisle = params.aisle.trim().toUpperCase();
        const bins = item.getBinLocations(params.warehouseId);
        if (!bins.some((b) => b.aisle === normAisle)) return false;
      }
      return true;
    });
  }
}
