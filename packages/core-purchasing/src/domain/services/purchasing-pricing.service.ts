import { divideHalfEven, roundHalfEven } from '@modulos/core-shared';
import { InvalidPurchasingInputError } from '../errors/purchasing-errors.js';

export interface LineCostCalculationInput {
  quantity: number;
  packSize: number;
  unitCostCents: number;
  discountCents: number;
  taxRateBps: number;
}

export interface LineCostCalculationResult {
  lineSubtotalCents: number;
  discountCents: number;
  netSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
  baseUnits: number;
  baseUnitCostCents: number;
}

/**
 * Computes exact monetary totals for a purchasing line in integer cents using ROUND_HALF_EVEN.
 * - `quantity * unitCostCents` is rounded half-even to support fractional quantities (e.g. kg/liters).
 * - `taxRateBps` is in basis points (e.g. 1600 = 16.00%).
 * - `baseUnitCostCents` is the net cost (after line discount, before tax) divided by `quantity * packSize`.
 */
export function calculatePurchasingLineTotals(
  input: LineCostCalculationInput,
): LineCostCalculationResult {
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new InvalidPurchasingInputError(`Quantity must be a non-negative finite number.`);
  }
  if (!Number.isFinite(input.packSize) || input.packSize <= 0) {
    throw new InvalidPurchasingInputError(`Pack size must be greater than zero.`);
  }
  if (!Number.isInteger(input.unitCostCents) || input.unitCostCents < 0) {
    throw new InvalidPurchasingInputError(`Unit cost must be a non-negative integer in cents.`);
  }
  if (!Number.isInteger(input.discountCents) || input.discountCents < 0) {
    throw new InvalidPurchasingInputError(`Discount must be a non-negative integer in cents.`);
  }
  if (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0) {
    throw new InvalidPurchasingInputError(`Tax rate (bps) must be a non-negative integer.`);
  }

  const lineSubtotalCents = roundHalfEven(input.quantity * input.unitCostCents);
  if (input.discountCents > lineSubtotalCents) {
    throw new InvalidPurchasingInputError(
      `Line discount (${input.discountCents} cents) cannot exceed line subtotal (${lineSubtotalCents} cents).`,
    );
  }

  const netSubtotalCents = lineSubtotalCents - input.discountCents;
  const lineTaxCents = divideHalfEven(
    BigInt(netSubtotalCents) * BigInt(input.taxRateBps),
    10_000n,
  );
  const lineTotalCents = netSubtotalCents + lineTaxCents;

  const baseUnits = input.quantity * input.packSize;
  const baseUnitCostCents =
    baseUnits > 0 ? roundHalfEven(netSubtotalCents / baseUnits) : roundHalfEven(input.unitCostCents / input.packSize);

  return {
    lineSubtotalCents,
    discountCents: input.discountCents,
    netSubtotalCents,
    lineTaxCents,
    lineTotalCents,
    baseUnits,
    baseUnitCostCents,
  };
}

export interface DocumentTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function sumDocumentTotals(
  lines: ReadonlyArray<{
    lineSubtotalCents: number;
    discountCents: number;
    lineTaxCents: number;
    lineTotalCents: number;
  }>,
): DocumentTotals {
  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let totalCents = 0;

  for (const line of lines) {
    subtotalCents += line.lineSubtotalCents;
    discountCents += line.discountCents;
    taxCents += line.lineTaxCents;
    totalCents += line.lineTotalCents;
  }

  return { subtotalCents, discountCents, taxCents, totalCents };
}

/**
 * Computes weighted average unit cost in cents when combining existing stock with a new receipt.
 */
export function calculateWeightedAverageCostCents(params: {
  existingStockUnits: number;
  existingUnitCostCents: number;
  receivedUnits: number;
  receivedUnitCostCents: number;
}): number {
  const { existingStockUnits, existingUnitCostCents, receivedUnits, receivedUnitCostCents } = params;
  if (receivedUnits <= 0) {
    return existingUnitCostCents;
  }
  const effectiveExistingUnits = Math.max(0, existingStockUnits);
  const totalUnits = effectiveExistingUnits + receivedUnits;
  if (totalUnits <= 0) {
    return receivedUnitCostCents;
  }
  const totalValueCents =
    effectiveExistingUnits * existingUnitCostCents + receivedUnits * receivedUnitCostCents;
  return roundHalfEven(totalValueCents / totalUnits);
}
