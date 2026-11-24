import { describe, expect, it } from 'vitest';
import {
  buildEscPosQrCodeBytes,
  CashReconciliation,
  EscPosTicketFormatter,
  evaluateDiscrepancyTolerance,
  getCurrencyDenominationPreset,
  Money,
  PaymentMethod,
  resolveCashierFeatures,
} from '../src/index.js';

describe('@modulos/core-cashier: Flagged Enhancements (Presets, Tolerance, ESC/POS QR & Copy)', () => {
  it('provides ISO 4217 denomination presets and falls back cleanly', () => {
    expect(getCurrencyDenominationPreset('MXN')).toContain(1000);
    expect(getCurrencyDenominationPreset('jpy')).toContain(10000);
    expect(getCurrencyDenominationPreset('XYZ')).toEqual(getCurrencyDenominationPreset('USD'));

    const basicFlags = resolveCashierFeatures('BASIC');
    expect(basicFlags.denominationPresets).toBe(true);
    expect(basicFlags.escPosQrCodes).toBe(false);
    expect(basicFlags.tolerancePolicies).toBe(false);
  });

  it('evaluates cash reconciliation discrepancy tolerance policies accurately', () => {
    const rec = new CashReconciliation({
      shiftId: 's1',
      expectedCash: Money.fromDecimal(1000, 'MXN'),
      declaredCash: Money.fromDecimal(992, 'MXN'), // 8.00 shortage = 800 cents
    });

    const strictEval = evaluateDiscrepancyTolerance(rec, {
      maxAbsoluteCents: 500,
      maxPercentOfExpected: 1,
    });
    expect(strictEval.withinTolerance).toBe(false);
    expect(strictEval.requiresSupervisorReview).toBe(true);
    expect(strictEval.maxAllowedCents).toBe(500);

    const relaxedEval = evaluateDiscrepancyTolerance(rec, {
      maxAbsoluteCents: 1000,
      maxPercentOfExpected: 1, // 1% of 100_000 = 1000 cents
    });
    expect(relaxedEval.withinTolerance).toBe(true);
    expect(relaxedEval.requiresSupervisorReview).toBe(false);
  });

  it('formats ESC/POS reprint copies, custom footer, and binary QR code payloads', () => {
    const formatter = new EscPosTicketFormatter({
      storeName: 'Tienda Centro',
      isReprintCopy: true,
      footerMessage: 'Conserve su ticket',
    });

    const text = formatter.formatPaymentReceiptPlainText(
      {
        movements: [
          {
            id: 'm1',
            paymentMethod: PaymentMethod.CASH,
            amount: Money.fromDecimal(150, 'MXN'),
          } as never,
        ],
        ticketTotal: Money.fromDecimal(150, 'MXN'),
        tenderedCash: Money.fromDecimal(200, 'MXN'),
        changeGiven: Money.fromDecimal(50, 'MXN'),
        isReplay: false,
      },
      'VTA-100',
      'Cajero 1'
    );

    expect(text).toContain('*** COPIA / REIMPRESION ***');
    expect(text).toContain('Conserve su ticket');

    const qrBytes = buildEscPosQrCodeBytes('https://verify.example/VTA-100', 6);
    expect(qrBytes[0]).toBe(0x1d);
    expect(qrBytes[1]).toBe(0x28);
    expect(qrBytes[2]).toBe(0x6b);
    expect(qrBytes.length).toBeGreaterThan(20);
  });
});
