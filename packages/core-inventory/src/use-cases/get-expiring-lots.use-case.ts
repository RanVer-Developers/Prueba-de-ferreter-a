import { IInventoryEventBus, InventoryDomainEvent, LotExpiringSoonPayload } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { BatchLot } from '../domain/value-objects/batch-lot.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';

export interface GetExpiringLotsRequest {
  warehouseId: string;
  daysThreshold?: number;
  includeAlreadyExpired?: boolean;
  referenceDate?: Date;
}

export interface ExpiringLotEntry {
  itemId: string;
  sku: string;
  name: string;
  warehouseId: string;
  lot: BatchLot;
  daysUntilExpiration: number;
  isExpired: boolean;
}

export interface GetExpiringLotsResponse {
  warehouseId: string;
  daysThreshold: number;
  expiringLots: ExpiringLotEntry[];
  expiredLots: ExpiringLotEntry[];
}

export class GetExpiringLotsUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: GetExpiringLotsRequest): Promise<GetExpiringLotsResponse> {
    const daysThreshold = request.daysThreshold ?? 30;
    const referenceDate = request.referenceDate ?? new Date();
    const items = await this.itemRepo.listAll();

    const expiringLots: ExpiringLotEntry[] = [];
    const expiredLots: ExpiringLotEntry[] = [];
    const events: InventoryDomainEvent<LotExpiringSoonPayload>[] = [];

    for (const item of items) {
      if (item.trackingType !== 'BATCH_LOT') continue;

      const soon = item.getExpiringLots(request.warehouseId, daysThreshold, referenceDate);
      for (const lot of soon) {
        const days = lot.daysUntilExpiration(referenceDate);
        expiringLots.push({
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          warehouseId: request.warehouseId,
          lot,
          daysUntilExpiration: days,
          isExpired: false,
        });

        events.push({
          eventId: generateInventoryId('evt-lot-exp'),
          eventName: 'LotExpiringSoonEvent',
          aggregateId: item.id,
          occurredAt: referenceDate,
          payload: {
            itemId: item.id,
            warehouseId: request.warehouseId,
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate,
            remainingQuantity: lot.currentQuantity,
            daysUntilExpiration: days,
          },
        });
      }

      if (request.includeAlreadyExpired) {
        const alreadyExpired = item.getExpiredLots(request.warehouseId, referenceDate);
        for (const lot of alreadyExpired) {
          expiredLots.push({
            itemId: item.id,
            sku: item.sku,
            name: item.name,
            warehouseId: request.warehouseId,
            lot,
            daysUntilExpiration: lot.daysUntilExpiration(referenceDate),
            isExpired: true,
          });
        }
      }
    }

    if (this.eventBus && events.length > 0) {
      await this.eventBus.publish(events);
    }

    return {
      warehouseId: request.warehouseId,
      daysThreshold,
      expiringLots,
      expiredLots,
    };
  }
}
