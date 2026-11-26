import { describe, expect, it } from 'vitest';
import {
  ESC_POS_COMMANDS,
  EscPosTicketFormatter,
  Money,
  PaymentMethod,
  PaymentResult,
  ShiftReportData,
} from '../src/index.js';

describe('EscPosTicketFormatter (Thermal Printer & Plain Text)', () => {
  const dummyReport: ShiftReportData = {
    reportType: 'Z',
    reportTitle: 'CORTE FISCAL Z (CIERRE FINAL)',
    generatedAt: '2026-11-12T20:30:00.000Z',
    isFiscalFinalCut: true,
    shiftId: 'shift-1002',
    cashRegisterId: 'pos-01',
    cashRegisterName: 'Caja Mostrador Norte',
    cashierId: 'usr-1',
    cashierName: 'Laura Gómez',
    openedAt: '2026-11-12T08:00:00.000Z',
    closedAt: '2026-11-12T20:00:00.000Z',
    currency: 'USD',
    initialBalance: 150,
    grossSales: 850,
    refunds: 50,
    netSales: 800,
    tipsCollected: 45,
    tipsPaidOut: 45,
    unpaidTips: 0,
    deposits: 0,
    withdrawals: 30,
    safeDrops: 500,
    voidedTotal: 0,
    currentCashInDrawer: 370,
    reconciliation: {
      expectedCash: 370,
      declaredCash: 370,
      difference: 0,
      status: 'EXACT' as any,
      retainedFloat: 150,
      bankDeposit: 220,
      supervisorId: 'sup-99',
      signatureToken: 'HMAC_TOKEN_SUPERVISOR_SIGNATURE_OK',
      isBlindCount: true,
    },
    totalsByMethod: [
      { method: PaymentMethod.CASH, in: 800, out: 50, net: 750 },
      { method: PaymentMethod.CREDIT_CARD, in: 50, out: 0, net: 50 },
    ],
    expensesByCategory: {
      CLEANING_SUPPLIES: 30,
    },
    movementsCount: 24,
  };

  it('debe generar texto plano monoespaciado alineado en 42 columnas', () => {
    const formatter = new EscPosTicketFormatter({
      columnWidth: 42,
      storeName: 'RESTAURANTE EL SABOR S.A.',
      storeAddress: 'Av. Siempre Viva 742, CDMX',
      storeTaxId: 'SAB-901112-990',
    });

    const output = formatter.formatAuditReportPlainText(dummyReport);

    expect(output).toContain('RESTAURANTE EL SABOR S.A.');
    expect(output).toContain('CORTE FISCAL Z (CIERRE FINAL)');
    expect(output).toContain('VENTAS NETAS:');
    expect(output).toContain('800.00 USD');
    expect(output).toContain('FONDO BASE RETENIDO:');
    expect(output).toContain('150.00 USD');
    expect(output).toContain('DEPOSITO BANCARIO / REMESA:');
    expect(output).toContain('220.00 USD');
    expect(output).toContain('*** CORTE FINAL DEFINITIVO ***');

    // Verificar que ninguna línea sobrepase el ancho de 42 columnas (excepto saltos)
    const lines = output.split('\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it('debe generar secuencias binarias de comandos ESC/POS con apertura de cajón y corte', () => {
    const formatter = new EscPosTicketFormatter({
      columnWidth: 42,
      storeName: 'FARMACIA CENTRAL',
      openCashDrawer: true,
      cutPaper: true,
    });

    const binaryString = formatter.formatAuditReportEscPos(dummyReport);

    // Contiene comando de inicialización ESC @
    expect(binaryString).toContain(ESC_POS_COMMANDS.INIT);
    // Contiene comando de apertura de cajón portamonedas ESC p 0 25 250
    expect(binaryString).toContain(ESC_POS_COMMANDS.OPEN_DRAWER);
    // Contiene comando de negrita ESC E 1
    expect(binaryString).toContain(ESC_POS_COMMANDS.BOLD_ON);
    // Contiene comando de corte de papel GS V 1
    expect(binaryString).toContain(ESC_POS_COMMANDS.PARTIAL_CUT);
    expect(binaryString).toContain('FARMACIA CENTRAL');
    expect(binaryString).toContain('CORTE FISCAL Z');
  });

  it('debe generar comprobante de venta para cliente con efectivo y vuelto', () => {
    const formatter = new EscPosTicketFormatter({
      columnWidth: 32, // Versión compacta 58mm
      storeName: 'MINI MARKET EXPRESS',
    });

    const dummyPaymentResult: PaymentResult = {
      movements: [
        {
          id: 'm1',
          paymentMethod: PaymentMethod.CASH,
          amount: Money.fromDecimal(120, 'USD'),
        } as any,
      ],
      ticketTotal: Money.fromDecimal(120, 'USD'),
      totalPaid: Money.fromDecimal(120, 'USD'),
      cashRequired: Money.fromDecimal(120, 'USD'),
      changeGiven: Money.fromDecimal(80, 'USD'),
      tenderedCash: Money.fromDecimal(200, 'USD'),
      isCashLimitExceeded: false,
    };

    const receipt = formatter.formatPaymentReceiptPlainText(
      dummyPaymentResult,
      'FACT-00991',
      'Laura Gómez'
    );

    expect(receipt).toContain('COMPROBANTE:');
    expect(receipt).toContain('FACT-00991');
    expect(receipt).toContain('TOTAL VENTA:');
    expect(receipt).toContain('120.00 USD');
    expect(receipt).toContain('EFECTIVO RECIBIDO:');
    expect(receipt).toContain('200.00 USD');
    expect(receipt).toContain('VUELTO / CAMBIO:');
    expect(receipt).toContain('80.00 USD');
    expect(receipt).toContain('¡GRACIAS POR SU COMPRA!');
  });
});
