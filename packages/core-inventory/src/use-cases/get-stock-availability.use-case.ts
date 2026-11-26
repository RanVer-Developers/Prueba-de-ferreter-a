import { ItemNotFoundError } from '../domain/errors/inventory-errors.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';

export interface GetStockAvailabilityRequest {
  itemId?: string;
  sku?: string;
  barcode?: string;
  warehouseId?: string;
}

export interface StockLocationAvailability {
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export interface GetStockAvailabilityResponse {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalInTransit: number;
  byWarehouse: StockLocationAvailability[];
}

export class GetStockAvailabilityUseCase {
  constructor(private readonly itemRepo: IInventoryItemRepository) {}

  public async execute(request: GetStockAvailabilityRequest): Promise<GetStockAvailabilityResponse> {
    let item = null;
    if (request.itemId) {
      item = await this.itemRepo.findById(request.itemId);
    } else if (request.sku) {
      item = await this.itemRepo.findBySku(request.sku);
    } else if (request.barcode) {
      item = await this.itemRepo.findByBarcode(request.barcode);
    }

    if (!item) {
      throw new ItemNotFoundError(request.itemId ?? request.sku ?? request.barcode ?? 'desconocido');
    }

    const itemJson = item.toJSON();
    const byWarehouse: StockLocationAvailability[] = [];

    let totalOnHand = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let totalInTransit = 0;

    for (const [whId, stock] of Object.entries(itemJson.stocks)) {
      if (request.warehouseId && whId !== request.warehouseId) continue;

      const avail = Math.max(0, stock.onHand - stock.reserved);
      totalOnHand += stock.onHand;
      totalReserved += stock.reserved;
      totalAvailable += avail;
      totalInTransit += stock.inTransit;

      byWarehouse.push({
        warehouseId: whId,
        onHand: stock.onHand,
        reserved: stock.reserved,
        available: avail,
        inTransit: stock.inTransit,
        isLowStock: avail <= item.getReorderRules(whId).reorderPoint,
        isOutOfStock: avail <= 0,
      });
    }

    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      uom: item.uom.code,
      totalOnHand,
      totalReserved,
      totalAvailable,
      totalInTransit,
      byWarehouse,
    };
  }
}
