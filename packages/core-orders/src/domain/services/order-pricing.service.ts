import { DiscountRule, OrderSurcharge, TaxMode, TaxRule } from '../../schemas/order-schemas.js';
import {
  apportionByWeights,
  divideHalfEven,
  Money,
  multiplyCentsHalfEven,
} from '../value-objects/money.js';

export interface PricingLineInput {
  lineId: string;
  quantity: number;
  unitPriceCents: number;
  taxes: ReadonlyArray<TaxRule>;
  discounts: ReadonlyArray<DiscountRule>;
}

export interface LineTaxAmount {
  taxId: string;
  code: string;
  name: string;
  ratePercent: number;
  mode: TaxMode;
  taxableBase: Money;
  amount: Money;
}

export interface OrderLineTotals {
  lineId: string;
  grossAmount: Money;
  lineDiscountAmount: Money;
  proratedOrderDiscountAmount: Money;
  totalDiscountAmount: Money;
  netSubtotal: Money;
  inclusiveTaxAmount: Money;
  exclusiveTaxAmount: Money;
  taxTotal: Money;
  total: Money;
  taxes: LineTaxAmount[];
}

export interface TaxBreakdownEntry {
  code: string;
  name: string;
  ratePercent: number;
  mode: TaxMode;
  taxableBase: Money;
  amount: Money;
}

export interface OrderPricingSummary {
  currency: string;
  grossSubtotal: Money;
  lineDiscountTotal: Money;
  orderDiscountTotal: Money;
  discountTotal: Money;
  netSubtotal: Money;
  inclusiveTaxTotal: Money;
  exclusiveTaxTotal: Money;
  taxTotal: Money;
  surchargeTotal: Money;
  total: Money;
  taxBreakdown: TaxBreakdownEntry[];
  lines: OrderLineTotals[];
}

const RATE_SCALE = 10_000n;
const RATE_HUNDRED_PERCENT = 1_000_000n;

function applyDiscountSequence(baseCents: number, discounts: ReadonlyArray<DiscountRule>): number {
  let remaining = baseCents;
  for (const discount of discounts) {
    if (remaining <= 0) break;
    let deduction = 0;
    if (discount.type === 'PERCENTAGE') {
      const scaledRate = BigInt(Math.round(discount.value * 10_000));
      deduction = divideHalfEven(BigInt(remaining) * scaledRate, RATE_HUNDRED_PERCENT);
    } else {
      deduction = Math.min(remaining, discount.value);
    }
    remaining -= Math.min(remaining, deduction);
  }
  return baseCents - remaining;
}

/**
 * Pure stateless pricing engine operating strictly in integer minor units (cents)
 * with ROUND_HALF_EVEN and Hamilton apportionment for exact cent reconciliation.
 */
export class OrderPricingService {
  public static calculate(params: {
    currency: string;
    lines: ReadonlyArray<PricingLineInput>;
    orderDiscounts: ReadonlyArray<DiscountRule>;
    surcharges?: ReadonlyArray<OrderSurcharge>;
  }): OrderPricingSummary {
    const currency = params.currency.toUpperCase().trim();

    if (params.lines.length === 0) {
      const zero = Money.zero(currency);
      return {
        currency,
        grossSubtotal: zero,
        lineDiscountTotal: zero,
        orderDiscountTotal: zero,
        discountTotal: zero,
        netSubtotal: zero,
        inclusiveTaxTotal: zero,
        exclusiveTaxTotal: zero,
        taxTotal: zero,
        surchargeTotal: zero,
        total: zero,
        taxBreakdown: [],
        lines: [],
      };
    }

    // 1. Line gross & line-level discounts
    const preOrderLines = params.lines.map((line) => {
      const grossCents = multiplyCentsHalfEven(line.unitPriceCents, line.quantity);
      const lineDiscountCents = applyDiscountSequence(grossCents, line.discounts);
      const afterLineDiscountCents = grossCents - lineDiscountCents;
      return {
        line,
        grossCents,
        lineDiscountCents,
        afterLineDiscountCents,
      };
    });

    // 2. Order-level discounts prorated across lines
    const subtotalAfterLineDiscounts = preOrderLines.reduce(
      (sum, item) => sum + item.afterLineDiscountCents,
      0
    );
    const orderDiscountTotalCents = applyDiscountSequence(
      subtotalAfterLineDiscounts,
      params.orderDiscounts
    );
    const proratedOrderDiscounts = apportionByWeights(
      orderDiscountTotalCents,
      preOrderLines.map((item) => item.afterLineDiscountCents)
    );

    // 3. Per-line taxes (inclusive extraction + exclusive addition) & totals
    const taxAggregator = new Map<
      string,
      {
        code: string;
        name: string;
        ratePercent: number;
        mode: TaxMode;
        taxableBaseCents: number;
        amountCents: number;
      }
    >();

    let grossSubtotalCents = 0;
    let lineDiscountTotalCents = 0;
    let netSubtotalTotalCents = 0;
    let inclusiveTaxTotalAllCents = 0;
    let exclusiveTaxTotalAllCents = 0;

    const lineTotals: OrderLineTotals[] = preOrderLines.map((item, idx) => {
      const proratedOrderDiscountCents = proratedOrderDiscounts[idx] ?? 0;
      const payableBeforeExclusiveTaxCents = item.afterLineDiscountCents - proratedOrderDiscountCents;

      const inclusiveTaxes = item.line.taxes.filter((t) => t.mode === 'INCLUSIVE');
      const exclusiveTaxes = item.line.taxes.filter((t) => t.mode === 'EXCLUSIVE');

      let netSubtotalCents = payableBeforeExclusiveTaxCents;
      let inclusiveTaxCents = 0;

      if (inclusiveTaxes.length > 0 && payableBeforeExclusiveTaxCents > 0) {
        const totalInclusiveScaled = inclusiveTaxes.reduce(
          (acc, t) => acc + BigInt(Math.round(t.ratePercent * Number(RATE_SCALE))),
          0n
        );
        netSubtotalCents = divideHalfEven(
          BigInt(payableBeforeExclusiveTaxCents) * RATE_HUNDRED_PERCENT,
          RATE_HUNDRED_PERCENT + totalInclusiveScaled
        );
        inclusiveTaxCents = payableBeforeExclusiveTaxCents - netSubtotalCents;
      }

      const inclusiveShares =
        inclusiveTaxes.length > 0
          ? apportionByWeights(
              inclusiveTaxCents,
              inclusiveTaxes.map((t) => t.ratePercent)
            )
          : [];

      const computedTaxes: LineTaxAmount[] = [];

      inclusiveTaxes.forEach((tax, taxIdx) => {
        const amountCents = inclusiveShares[taxIdx] ?? 0;
        computedTaxes.push({
          taxId: tax.id,
          code: tax.code,
          name: tax.name,
          ratePercent: tax.ratePercent,
          mode: tax.mode,
          taxableBase: Money.fromCents(netSubtotalCents, currency),
          amount: Money.fromCents(amountCents, currency),
        });
        const key = `${tax.code}|${tax.ratePercent}|${tax.mode}`;
        const existing = taxAggregator.get(key);
        if (existing) {
          existing.taxableBaseCents += netSubtotalCents;
          existing.amountCents += amountCents;
        } else {
          taxAggregator.set(key, {
            code: tax.code,
            name: tax.name,
            ratePercent: tax.ratePercent,
            mode: tax.mode,
            taxableBaseCents: netSubtotalCents,
            amountCents,
          });
        }
      });

      let exclusiveTaxCents = 0;
      for (const tax of exclusiveTaxes) {
        const scaledRate = BigInt(Math.round(tax.ratePercent * Number(RATE_SCALE)));
        const amountCents = divideHalfEven(
          BigInt(netSubtotalCents) * scaledRate,
          RATE_HUNDRED_PERCENT
        );
        exclusiveTaxCents += amountCents;
        computedTaxes.push({
          taxId: tax.id,
          code: tax.code,
          name: tax.name,
          ratePercent: tax.ratePercent,
          mode: tax.mode,
          taxableBase: Money.fromCents(netSubtotalCents, currency),
          amount: Money.fromCents(amountCents, currency),
        });
        const key = `${tax.code}|${tax.ratePercent}|${tax.mode}`;
        const existing = taxAggregator.get(key);
        if (existing) {
          existing.taxableBaseCents += netSubtotalCents;
          existing.amountCents += amountCents;
        } else {
          taxAggregator.set(key, {
            code: tax.code,
            name: tax.name,
            ratePercent: tax.ratePercent,
            mode: tax.mode,
            taxableBaseCents: netSubtotalCents,
            amountCents,
          });
        }
      }

      const lineTaxTotalCents = inclusiveTaxCents + exclusiveTaxCents;
      const lineTotalCents = netSubtotalCents + lineTaxTotalCents;

      grossSubtotalCents += item.grossCents;
      lineDiscountTotalCents += item.lineDiscountCents;
      netSubtotalTotalCents += netSubtotalCents;
      inclusiveTaxTotalAllCents += inclusiveTaxCents;
      exclusiveTaxTotalAllCents += exclusiveTaxCents;

      return {
        lineId: item.line.lineId,
        grossAmount: Money.fromCents(item.grossCents, currency),
        lineDiscountAmount: Money.fromCents(item.lineDiscountCents, currency),
        proratedOrderDiscountAmount: Money.fromCents(proratedOrderDiscountCents, currency),
        totalDiscountAmount: Money.fromCents(
          item.lineDiscountCents + proratedOrderDiscountCents,
          currency
        ),
        netSubtotal: Money.fromCents(netSubtotalCents, currency),
        inclusiveTaxAmount: Money.fromCents(inclusiveTaxCents, currency),
        exclusiveTaxAmount: Money.fromCents(exclusiveTaxCents, currency),
        taxTotal: Money.fromCents(lineTaxTotalCents, currency),
        total: Money.fromCents(lineTotalCents, currency),
        taxes: computedTaxes,
      };
    });

    const discountTotalCents = lineDiscountTotalCents + orderDiscountTotalCents;
    const taxTotalCents = inclusiveTaxTotalAllCents + exclusiveTaxTotalAllCents;
    const preSurchargeTotalCents = netSubtotalTotalCents + taxTotalCents;

    let surchargeTotalCents = 0;
    for (const s of params.surcharges ?? []) {
      if (s.type === 'FIXED_AMOUNT') {
        surchargeTotalCents += Math.round(s.value);
      } else {
        const scaledRate = BigInt(Math.round(s.value * 10_000));
        surchargeTotalCents += divideHalfEven(
          BigInt(preSurchargeTotalCents) * scaledRate,
          RATE_HUNDRED_PERCENT
        );
      }
    }
    const totalCents = preSurchargeTotalCents + surchargeTotalCents;

    const taxBreakdown: TaxBreakdownEntry[] = Array.from(taxAggregator.values()).map((entry) => ({
      code: entry.code,
      name: entry.name,
      ratePercent: entry.ratePercent,
      mode: entry.mode,
      taxableBase: Money.fromCents(entry.taxableBaseCents, currency),
      amount: Money.fromCents(entry.amountCents, currency),
    }));

    return {
      currency,
      grossSubtotal: Money.fromCents(grossSubtotalCents, currency),
      lineDiscountTotal: Money.fromCents(lineDiscountTotalCents, currency),
      orderDiscountTotal: Money.fromCents(orderDiscountTotalCents, currency),
      discountTotal: Money.fromCents(discountTotalCents, currency),
      netSubtotal: Money.fromCents(netSubtotalTotalCents, currency),
      inclusiveTaxTotal: Money.fromCents(inclusiveTaxTotalAllCents, currency),
      exclusiveTaxTotal: Money.fromCents(exclusiveTaxTotalAllCents, currency),
      taxTotal: Money.fromCents(taxTotalCents, currency),
      surchargeTotal: Money.fromCents(surchargeTotalCents, currency),
      total: Money.fromCents(totalCents, currency),
      taxBreakdown,
      lines: lineTotals,
    };
  }
}
