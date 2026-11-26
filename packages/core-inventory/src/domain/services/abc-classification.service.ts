import { InventoryItem } from '../entities/inventory-item.js';
import { Money } from '../value-objects/money.js';
import { ValuationService } from './valuation.service.js';

export type ABCClass = 'A' | 'B' | 'C';

export interface ABCItemClassification {
  itemId: string;
  sku: string;
  name: string;
  onHandQuantity: number;
  totalValuation: Money;
  percentageOfTotalValue: number;
  cumulativePercentage: number;
  abcClass: ABCClass;
  recommendedCountFrequencyDays: number;
}

export interface ABCAnalysisResult {
  totalInventoryValuation: Money;
  totalSkus: number;
  summary: {
    classA: { count: number; totalValue: Money; percentageValue: number };
    classB: { count: number; totalValue: Money; percentageValue: number };
    classC: { count: number; totalValue: Money; percentageValue: number };
  };
  items: ABCItemClassification[];
}

/**
 * Servicio de dominio para el análisis de clasificación ABC (Principio de Pareto 80/15/5)
 * y programación de frecuencias recomendadas de conteos cíclicos.
 */
export class ABCClassificationService {
  public static analyze(
    items: InventoryItem[],
    warehouseId?: string
  ): ABCAnalysisResult {
    if (items.length === 0) {
      return {
        totalInventoryValuation: Money.zero(),
        totalSkus: 0,
        summary: {
          classA: { count: 0, totalValue: Money.zero(), percentageValue: 0 },
          classB: { count: 0, totalValue: Money.zero(), percentageValue: 0 },
          classC: { count: 0, totalValue: Money.zero(), percentageValue: 0 },
        },
        items: [],
      };
    }

    // 1. Obtener valorización individual de cada item
    const valuations = items.map((item) => {
      const val = ValuationService.calculateItemValuation(item, warehouseId);
      return {
        item,
        valuation: val,
        cents: val.totalValuation.toCents(),
      };
    });

    const currency = valuations[0]?.valuation.totalValuation.currency ?? 'USD';

    // 2. Ordenar de mayor a menor valor económico
    valuations.sort((a, b) => b.cents - a.cents);

    const totalCents = valuations.reduce((sum, v) => sum + v.cents, 0);

    let cumulativeCents = 0;
    const classifiedItems: ABCItemClassification[] = [];

    let countA = 0;
    let centsA = 0;
    let countB = 0;
    let centsB = 0;
    let countC = 0;
    let centsC = 0;

    for (const v of valuations) {
      cumulativeCents += v.cents;
      const pctOfTotal = totalCents > 0 ? (v.cents / totalCents) * 100 : 0;
      const cumulativePct = totalCents > 0 ? (cumulativeCents / totalCents) * 100 : 100;

      let abcClass: ABCClass;
      let freqDays: number;

      if (cumulativePct <= 80 || classifiedItems.length === 0) {
        abcClass = 'A';
        freqDays = 30; // Conteo mensual
        countA++;
        centsA += v.cents;
      } else if (cumulativePct <= 95) {
        abcClass = 'B';
        freqDays = 90; // Conteo trimestral
        countB++;
        centsB += v.cents;
      } else {
        abcClass = 'C';
        freqDays = 180; // Conteo semestral / anual
        countC++;
        centsC += v.cents;
      }

      classifiedItems.push({
        itemId: v.item.id,
        sku: v.item.sku,
        name: v.item.name,
        onHandQuantity: v.valuation.totalOnHandQuantity,
        totalValuation: v.valuation.totalValuation,
        percentageOfTotalValue: Number(pctOfTotal.toFixed(2)),
        cumulativePercentage: Number(cumulativePct.toFixed(2)),
        abcClass,
        recommendedCountFrequencyDays: freqDays,
      });
    }

    const totalMoney = Money.fromCents(totalCents, currency);

    return {
      totalInventoryValuation: totalMoney,
      totalSkus: items.length,
      summary: {
        classA: {
          count: countA,
          totalValue: Money.fromCents(centsA, currency),
          percentageValue: totalCents > 0 ? Number(((centsA / totalCents) * 100).toFixed(2)) : 0,
        },
        classB: {
          count: countB,
          totalValue: Money.fromCents(centsB, currency),
          percentageValue: totalCents > 0 ? Number(((centsB / totalCents) * 100).toFixed(2)) : 0,
        },
        classC: {
          count: countC,
          totalValue: Money.fromCents(centsC, currency),
          percentageValue: totalCents > 0 ? Number(((centsC / totalCents) * 100).toFixed(2)) : 0,
        },
      },
      items: classifiedItems,
    };
  }
}
