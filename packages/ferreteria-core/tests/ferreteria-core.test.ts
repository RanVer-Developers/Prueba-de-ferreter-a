import { describe, it, expect, beforeEach } from 'vitest';
import { createFerreteriaApp, type FerreteriaApp } from '../src/index.js';

describe('Ferreteria El Tornillo Fuerte — Core Domain Seams', () => {
  let app: FerreteriaApp;

  beforeEach(async () => {
    app = await createFerreteriaApp({
      ownerPin: '9999',
      sellerPin: '1111',
      cashierPin: '2222',
      warehousePin: '3333',
    });
  });

  describe('Seam 1: Smart Search, Aliases, Locations & Unit Equivalences', () => {
    it('finds hardware items by common nickname or measure in <5s and exposes location & prices', async () => {
      await app.registerProduct({
        itemId: 'item-codo-pvc',
        sku: 'PVC-CODO-12',
        officialName: 'Conector Codo 90 grados PVC Hidraulico 13mm',
        aliases: ['codo 1/2', 'codo pvc medio'],
        measures: ['1/2"', '13mm'],
        category: 'Plomeria',
        aisle: 'P3',
        shelf: 'E2',
        baseUnit: 'PIECE',
        publicPriceCents: 1200,
        wholesalePriceCents: 950,
        wholesaleMinQty: 20,
        lastCostCents: 700,
        minStockQty: 15,
        initialStockQty: 50,
      });

      const results = await app.searchProducts('codo 1/2');
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        itemId: 'item-codo-pvc',
        aisle: 'P3',
        shelf: 'E2',
        publicPriceCents: 1200,
        wholesalePriceCents: 950,
        availableQty: 50,
      });
    });

    it('sells fractional meters from a 100m cable roll and closed boxes with exact stock deduction', async () => {
      await app.registerProduct({
        itemId: 'item-cable-12',
        sku: 'ELEC-CAB-12',
        officialName: 'Cable THW Calibre 12 Rojo',
        aliases: ['cable 12', 'cable rojo'],
        measures: ['calibre 12', '100m'],
        category: 'Electrico',
        aisle: 'P1',
        shelf: 'E4',
        baseUnit: 'METER',
        packLabel: 'Rollo 100m',
        unitsPerPack: 100,
        publicPriceCents: 1800,
        wholesalePriceCents: 1500,
        wholesaleMinQty: 50,
        packPriceCents: 145000,
        lastCostCents: 1100,
        minStockQty: 30,
        initialStockQty: 200,
      });

      const order = await app.createParkedSale({
        sellerId: 'seller-1',
        deliveryMode: 'COUNTER_IMMEDIATE',
        lines: [
          { itemId: 'item-cable-12', quantity: 15.5, saleAsPack: false },
          { itemId: 'item-cable-12', quantity: 1, saleAsPack: true },
        ],
      });

      // 15.5m * 1800 = 27900 cents; 1 roll * 145000 = 145000 cents => total 172900 cents
      expect(order.grandTotalCents).toBe(172900);

      await app.openCashierShift({ cashierId: 'cashier-1', initialAmountPesos: 500 });
      await app.payOrderAtCashier({
        orderId: order.orderId,
        cashierId: 'cashier-1',
        payments: [{ method: 'CASH', amountCents: 172900 }],
      });

      const after = await app.searchProducts('cable 12');
      expect(after[0].availableQty).toBeCloseTo(200 - 15.5 - 100, 4);
    });
  });

  describe('Seam 2: Quote -> Reserve -> Recalculate -> Cashier -> Warehouse & Credit', () => {
    it('reserves stock on quote, recalculates updated prices, converts to parked order, pays, and unlocks warehouse dispatch', async () => {
      await app.registerProduct({
        itemId: 'item-cemento',
        sku: 'CEM-50KG',
        officialName: 'Cemento Gris Bulto 50kg',
        aliases: ['cemento', 'bulto cemento'],
        measures: ['50kg'],
        category: 'Construccion',
        aisle: 'PATIO',
        shelf: 'B1',
        baseUnit: 'PIECE',
        publicPriceCents: 24000,
        wholesalePriceCents: 22500,
        wholesaleMinQty: 20,
        lastCostCents: 19500,
        minStockQty: 20,
        initialStockQty: 40,
      });

      const quote = await app.createQuote({
        customerName: 'Maestro Juan Perez',
        reserveStock: true,
        lines: [{ itemId: 'item-cemento', quantity: 10, saleAsPack: false }],
      });

      expect(quote.status).toBe('RESERVED');
      expect(quote.whatsappSummary).toContain('Maestro Juan Perez');
      expect(quote.whatsappSummary).toContain('Cemento Gris Bulto 50kg');

      const duringReserve = await app.searchProducts('cemento');
      expect(duringReserve[0].availableQty).toBe(30);

      // Simulate price increase days later
      await app.updateProductPrice({
        itemId: 'item-cemento',
        publicPriceCents: 26000,
        ownerPin: '9999',
      });

      const recalculated = await app.recalculateQuotePrices(quote.quoteId);
      expect(recalculated.grandTotalCents).toBe(260000);

      const parked = await app.convertQuoteToParkedOrder({
        quoteId: quote.quoteId,
        sellerId: 'seller-1',
        deliveryMode: 'WAREHOUSE_PICKUP',
      });

      // Before payment, warehouse cannot dispatch
      await expect(
        app.dispatchWarehouseOrder({ orderId: parked.orderId, warehouseUserId: 'warehouse-1' })
      ).rejects.toThrow();

      await app.openCashierShift({ cashierId: 'cashier-1', initialAmountPesos: 1000 });
      await app.payOrderAtCashier({
        orderId: parked.orderId,
        cashierId: 'cashier-1',
        payments: [{ method: 'CASH', amountCents: 260000 }],
      });

      const dispatched = await app.dispatchWarehouseOrder({
        orderId: parked.orderId,
        warehouseUserId: 'warehouse-1',
      });
      expect(dispatched.status).toBe('DISPATCHED');

      // Stock committed: 40 - 10 = 30
      const after = await app.searchProducts('cemento');
      expect(after[0].availableQty).toBe(30);
    });

    it('blocks exceeded credit unless owner PIN overrides, and tracks partial payments by specific note', async () => {
      await app.registerProduct({
        itemId: 'item-varilla',
        sku: 'VAR-38',
        officialName: 'Varilla Corrugada 3/8',
        aliases: ['varilla 3/8'],
        measures: ['3/8'],
        category: 'Construccion',
        aisle: 'PATIO',
        shelf: 'A1',
        baseUnit: 'PIECE',
        publicPriceCents: 15000,
        wholesalePriceCents: 14000,
        wholesaleMinQty: 50,
        lastCostCents: 12000,
        minStockQty: 30,
        initialStockQty: 100,
      });

      await app.registerCreditCustomer({
        customerId: 'cust-1',
        displayName: 'Constructora Norte',
        creditLimitCents: 100000,
        creditTermDays: 15,
      });

      const order = await app.createParkedSale({
        sellerId: 'seller-1',
        customerId: 'cust-1',
        deliveryMode: 'WAREHOUSE_PICKUP',
        lines: [{ itemId: 'item-varilla', quantity: 10, saleAsPack: false }],
      });
      // 150,000 cents > 100,000 limit
      await app.openCashierShift({ cashierId: 'cashier-1', initialAmountPesos: 500 });

      await expect(
        app.chargeOrderToCredit({
          orderId: order.orderId,
          customerId: 'cust-1',
          cashierId: 'cashier-1',
        })
      ).rejects.toThrow();

      const creditNote = await app.chargeOrderToCredit({
        orderId: order.orderId,
        customerId: 'cust-1',
        cashierId: 'cashier-1',
        ownerPinOverride: '9999',
      });

      expect(creditNote.remainingCents).toBe(150000);

      // Authorized credit can be dispatched by warehouse
      const dispatch = await app.dispatchWarehouseOrder({
        orderId: order.orderId,
        warehouseUserId: 'warehouse-1',
      });
      expect(dispatch.status).toBe('DISPATCHED');

      // Partial payment to that specific note
      const updatedNote = await app.recordCreditNotePayment({
        noteId: creditNote.noteId,
        amountCents: 50000,
        cashierId: 'cashier-1',
        method: 'CASH',
      });
      expect(updatedNote.remainingCents).toBe(100000);
      expect(updatedNote.status).toBe('PARTIAL');
    });
  });

  describe('Seam 3: Zero-Stock Block, Cost-Increase Alert, Blind Close & Backup', () => {
    it('blocks sale on zero stock without owner PIN, and allows when owner PIN is supplied', async () => {
      await app.registerProduct({
        itemId: 'item-pija',
        sku: 'PIJA-1',
        officialName: 'Pija Negra Punta Broca 1 pulgada',
        aliases: ['pija negra'],
        measures: ['1"'],
        category: 'Tornilleria',
        aisle: 'P2',
        shelf: 'E1',
        baseUnit: 'PIECE',
        publicPriceCents: 150,
        wholesalePriceCents: 100,
        wholesaleMinQty: 100,
        lastCostCents: 60,
        minStockQty: 50,
        initialStockQty: 0,
      });

      await expect(
        app.createParkedSale({
          sellerId: 'seller-1',
          deliveryMode: 'COUNTER_IMMEDIATE',
          lines: [{ itemId: 'item-pija', quantity: 5, saleAsPack: false }],
        })
      ).rejects.toThrow();

      const authorizedOrder = await app.createParkedSale({
        sellerId: 'seller-1',
        deliveryMode: 'COUNTER_IMMEDIATE',
        ownerPinZeroStockOverride: '9999',
        lines: [{ itemId: 'item-pija', quantity: 5, saleAsPack: false }],
      });
      expect(authorizedOrder.grandTotalCents).toBe(750);
    });

    it('alerts when supplier purchase increases unit cost and updates catalog cost', async () => {
      await app.registerProduct({
        itemId: 'item-pintura',
        sku: 'PIN-19L',
        officialName: 'Pintura Vinilica Blanca 19L',
        aliases: ['cubeta pintura blanca'],
        measures: ['19L'],
        category: 'Pinturas',
        aisle: 'P4',
        shelf: 'E1',
        baseUnit: 'PIECE',
        publicPriceCents: 120000,
        wholesalePriceCents: 110000,
        wholesaleMinQty: 5,
        lastCostCents: 80000,
        minStockQty: 4,
        initialStockQty: 2,
      });

      const receipt = await app.receiveSupplierPurchase({
        supplierName: 'Comex Mayorista',
        invoiceNumber: 'FAC-1001',
        lines: [
          {
            itemId: 'item-pintura',
            quantity: 5,
            unitCostCents: 92000,
          },
        ],
      });

      expect(receipt.costIncreaseAlerts).toHaveLength(1);
      expect(receipt.costIncreaseAlerts[0]).toMatchObject({
        itemId: 'item-pintura',
        previousCostCents: 80000,
        newCostCents: 92000,
      });

      const lowStock = await app.getProductsToReorder();
      expect(lowStock.find((p) => p.itemId === 'item-pintura')).toBeUndefined();
    });

    it('supports blind cashier close, sanitized error logs, and JSON backup/restore', async () => {
      await app.registerProduct({
        itemId: 'item-martillo',
        sku: 'HER-MAR-16',
        officialName: 'Martillo Carpintero 16oz',
        aliases: ['martillo'],
        measures: ['16oz'],
        category: 'Herramientas',
        aisle: 'P1',
        shelf: 'E1',
        baseUnit: 'PIECE',
        publicPriceCents: 22000,
        wholesalePriceCents: 19500,
        wholesaleMinQty: 5,
        lastCostCents: 14000,
        minStockQty: 3,
        initialStockQty: 10,
      });

      await app.openCashierShift({ cashierId: 'cashier-1', initialAmountPesos: 500 });
      await app.recordCashExpense({
        cashierId: 'cashier-1',
        amountPesos: 120,
        reason: 'Gasolina camioneta reparto',
        category: 'SUPPLIES',
      });

      const closed = await app.closeCashierShiftBlind({
        cashierId: 'cashier-1',
        declaredCashPesos: 380,
      });
      expect(closed.declaredPesos).toBe(380);
      expect(closed.expectedPesos).toBe(380);
      expect(closed.discrepancyPesos).toBe(0);

      // Sanitized error log
      app.logError({
        screen: 'Caja',
        action: 'Autorizar',
        error: new Error('Invalid pin=9999 for user=admin@tienda.com'),
      });
      const reportText = app.exportTechnicalErrorReport();
      expect(reportText).not.toContain('9999');
      expect(reportText).not.toContain('admin@tienda.com');
      expect(reportText).toContain('[REDACTED]');

      // Backup & restore
      const backupJson = await app.exportBackupJson();
      const freshApp = await createFerreteriaApp({
        ownerPin: '9999',
        sellerPin: '1111',
        cashierPin: '2222',
        warehousePin: '3333',
      });
      await freshApp.importBackupJson(backupJson);
      const restored = await freshApp.searchProducts('martillo');
      expect(restored).toHaveLength(1);
      expect(restored[0].availableQty).toBe(10);
    });

    it('supports quick physical cycle counts by aisle without closing the hardware store', async () => {
      await app.registerProduct({
        itemId: 'item-desarmador',
        sku: 'HER-DES-1',
        officialName: 'Desarmador Plano 1/4',
        aliases: ['desarmador'],
        measures: ['1/4'],
        category: 'Herramientas',
        aisle: 'P1',
        shelf: 'E3',
        baseUnit: 'PIECE',
        publicPriceCents: 6500,
        wholesalePriceCents: 5500,
        wholesaleMinQty: 10,
        lastCostCents: 3500,
        minStockQty: 5,
        initialStockQty: 12,
      });

      const aisleItems = await app.getProductsByAisleOrCategory({ aisle: 'P1' });
      expect(aisleItems).toHaveLength(1);

      const diffs = await app.recordQuickCycleCount({
        userId: 'warehouse-1',
        counts: [{ itemId: 'item-desarmador', physicalQty: 9 }],
      });
      expect(diffs[0]).toMatchObject({
        itemId: 'item-desarmador',
        systemQty: 12,
        physicalQty: 9,
        deltaQty: -3,
      });

      const after = await app.searchProducts('desarmador');
      expect(after[0].availableQty).toBe(9);
    });
  });
});
