import { divideHalfEven, multiplyCentsHalfEven } from '@modulos/core-shared';
import type { ServiceLaborLine, ServicePartLine } from '../../schemas/services.schemas.js';

export interface ComputedChargeAmounts {
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

export function computeChargeLineAmounts(
  quantityOrHours: number,
  unitRateCents: number,
  taxRateBps: number,
): ComputedChargeAmounts {
  const subtotalCents = multiplyCentsHalfEven(unitRateCents, quantityOrHours);
  const taxCents = divideHalfEven(BigInt(subtotalCents) * BigInt(taxRateBps), 10_000n);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export interface ServiceOrderTotalsSummary {
  readonly laborSubtotalCents: number;
  readonly partsSubtotalCents: number;
  readonly taxTotalCents: number;
  readonly totalCents: number;
}

export function computeServiceOrderTotals(
  laborLines: ReadonlyArray<ServiceLaborLine>,
  partLines: ReadonlyArray<ServicePartLine>,
  isUnderWarranty: boolean,
): ServiceOrderTotalsSummary {
  if (isUnderWarranty) {
    return {
      laborSubtotalCents: 0,
      partsSubtotalCents: 0,
      taxTotalCents: 0,
      totalCents: 0,
    };
  }

  let laborSubtotalCents = 0;
  let partsSubtotalCents = 0;
  let taxTotalCents = 0;

  for (const line of laborLines) {
    laborSubtotalCents += line.subtotalCents;
    taxTotalCents += line.taxCents;
  }
  for (const line of partLines) {
    partsSubtotalCents += line.subtotalCents;
    taxTotalCents += line.taxCents;
  }

  return {
    laborSubtotalCents,
    partsSubtotalCents,
    taxTotalCents,
    totalCents: laborSubtotalCents + partsSubtotalCents + taxTotalCents,
  };
}
