import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';

export interface LowStockAlertItem {
  itemId: string;
  sku: string;
  name: string;
  warehouseId: string;
  onHand: number;
  available: number;
  minStock: number;
  reorderPoint: number;
  isOutOfStock: boolean;
}

export interface ExpiringLotAlert {
  itemId: string;
  sku: string;
  warehouseId: string;
  lotNumber: string;
  expirationDate: Date;
  daysRemaining: number;
  quantity: number;
}

export interface GetLowStockAlertsResponse {
  lowStockAlerts: LowStockAlertItem[];
  outOfStockAlerts: LowStockAlertItem[];
  expiringLots: ExpiringLotAlert[];
}

export class GetLowStockAlertsUseCase {
  constructor(private readonly itemRepo: IInventoryItemRepository) {}

  public async execute(params?: {
    warehouseId?: string;
    expiringDaysThreshold?: number;
  }): Promise<GetLowStockAlertsResponse> {
    const items = await this.itemRepo.listAll();
    const thresholdDays = params?.expiringDaysThreshold ?? 30;

    const lowStockAlerts: LowStockAlertItem[] = [];
    const outOfStockAlerts: LowStockAlertItem[] = [];
    const expiringLots: ExpiringLotAlert[] = [];

    for (const item of items) {
      const itemJson = item.toJSON();

      for (const [whId, stock] of Object.entries(itemJson.stocks)) {
        if (params?.warehouseId && whId !== params.warehouseId) continue;

        const available = Math.max(0, stock.onHand - stock.reserved);
        const isOut = available <= 0;
        const isLow = available <= item.reorderRules.reorderPoint;

        const alertItem: LowStockAlertItem = {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          warehouseId: whId,
          onHand: stock.onHand,
          available,
          minStock: item.reorderRules.minStock,
          reorderPoint: item.reorderRules.reorderPoint,
          isOutOfStock: isOut,
        };

        if (isOut) {
          outOfStockAlerts.push(alertItem);
        } else if (isLow) {
          lowStockAlerts.push(alertItem);
        }

        // Revisar lotes próximos a vencer
        const lots = item.getExpiringLots(whId, thresholdDays);
        for (const lot of lots) {
          expiringLots.push({
            itemId: item.id,
            sku: item.sku,
            warehouseId: whId,
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate,
            daysRemaining: lot.daysUntilExpiration(),
            quantity: lot.currentQuantity,
          });
        }
      }
    }

    return {
      lowStockAlerts,
      outOfStockAlerts,
      expiringLots,
    };
  }
}
