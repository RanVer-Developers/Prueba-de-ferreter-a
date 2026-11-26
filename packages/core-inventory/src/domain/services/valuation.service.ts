import { InventoryItem } from '../entities/inventory-item.js';
import { Money } from '../value-objects/money.js';

export interface InventoryValuationSummary {
  itemId: string;
  sku: string;
  name: string;
  totalOnHandQuantity: number;
  valuationMethod: string;
  averageUnitCost: Money;
  totalValuation: Money;
}

export interface PortfolioValuationSummary {
  warehouseId?: string;
  currency: string;
  totalItems: number;
  totalUnits: number;
  totalValuation: Money;
  items: InventoryValuationSummary[];
}

/**
 * Servicio de dominio para el cálculo y auditoría de la valorización financiera de inventarios.
 */
export class ValuationService {
  /**
   * Calcula la valorización total de un artículo sumando todas sus bodegas.
   */
  public static calculateItemValuation(item: InventoryItem, warehouseId?: string): InventoryValuationSummary {
    const itemJson = item.toJSON();
    let totalQty = 0;
    let totalCents = 0;
    const currency = item.averageCost.currency;

    for (const [whId, stock] of Object.entries(itemJson.stocks)) {
      if (warehouseId && whId !== warehouseId) continue;
      totalQty += stock.onHand;

      if (item.valuationMethod === 'FIFO') {
        for (const layer of stock.layers) {
          totalCents += layer.remainingQuantity * layer.unitCost.cents;
        }
      } else {
        totalCents += stock.onHand * item.averageCost.toCents();
      }
    }

    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      totalOnHandQuantity: totalQty,
      valuationMethod: item.valuationMethod,
      averageUnitCost: item.averageCost,
      totalValuation: Money.fromCents(totalCents, currency),
    };
  }

  /**
   * Calcula la valorización consolidada de un conjunto de artículos (global o por bodega).
   */
  public static calculatePortfolioValuation(
    items: InventoryItem[],
    warehouseId?: string,
    currency: string = 'USD'
  ): PortfolioValuationSummary {
    const summaries: InventoryValuationSummary[] = [];
    let totalUnits = 0;
    let totalCents = 0;
    let detectedCurrency = currency;

    for (const item of items) {
      const summary = this.calculateItemValuation(item, warehouseId);
      if (summary.totalOnHandQuantity > 0 || !warehouseId) {
        summaries.push(summary);
      }
      totalUnits += summary.totalOnHandQuantity;
      if (summary.totalValuation.currency === detectedCurrency) {
        totalCents += summary.totalValuation.toCents();
      } else if (totalCents === 0 && summary.totalValuation.toCents() > 0) {
        detectedCurrency = summary.totalValuation.currency;
        totalCents += summary.totalValuation.toCents();
      }
    }

    return {
      warehouseId,
      currency: detectedCurrency,
      totalItems: summaries.length,
      totalUnits,
      totalValuation: Money.fromCents(totalCents, detectedCurrency),
      items: summaries,
    };
  }
}
