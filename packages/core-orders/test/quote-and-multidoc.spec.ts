import { describe, expect, it } from 'vitest';
import {
  CreateOrderUseCase,
  InMemoryOrderRepository,
  InvalidOrderStateError,
  QuoteAndMultiDocUseCase,
} from '../src/index.js';

describe('@modulos/core-orders quotes, delivery notes, consolidation, and import', () => {
  it('creates a quote with expiration, converts it to a delivery note or order, and rejects expired quotes', async () => {
    const repo = new InMemoryOrderRepository();
    const createOrder = new CreateOrderUseCase(
      repo,
      undefined,
      { now: () => new Date('2026-07-01T10:00:00.000Z') },
      'ADVANCED',
    );
    const quoteOps = new QuoteAndMultiDocUseCase(
      repo,
      { now: () => new Date('2026-07-02T10:00:00.000Z') },
      'ADVANCED',
    );

    const quoteRes = await createOrder.execute({
      id: 'qt-1',
      documentKind: 'QUOTE',
      orderNumber: 'COT-100',
      currency: 'MXN',
      customerId: 'cust-1',
      quoteExpiresAt: '2026-07-10T23:59:59.000Z',
      lines: [
        {
          lineId: 'l1',
          productId: 'p-cem',
          name: 'Cemento',
          quantity: 10,
          unitPriceCents: 25_000,
        },
      ],
    });
    expect(quoteRes.order.documentKind).toBe('QUOTE');

    const converted = await quoteOps.convertQuoteToOrder({
      quoteId: 'qt-1',
      newOrderId: 'rem-1',
      newOrderNumber: 'REM-100',
      targetKind: 'DELIVERY_NOTE',
      unitPriceOverridesCents: { 'p-cem': 24_000 },
    });

    expect(converted.documentKind).toBe('DELIVERY_NOTE');
    expect(converted.sourceDocumentId).toBe('qt-1');
    expect(converted.calculateSummary().total.toCents()).toBe(240_000);

    const reloadedQuote = await repo.findById('qt-1');
    expect(reloadedQuote?.status).toBe('COMPLETED');

    // Expired quote cannot be converted
    await createOrder.execute({
      id: 'qt-exp',
      documentKind: 'QUOTE',
      currency: 'MXN',
      customerId: 'cust-1',
      quoteExpiresAt: '2026-07-01T12:00:00.000Z',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'Tubo', quantity: 1, unitPriceCents: 5_000 }],
    });

    await expect(
      quoteOps.convertQuoteToOrder({ quoteId: 'qt-exp', newOrderId: 'ord-fail' }),
    ).rejects.toThrow(InvalidOrderStateError);
  });

  it('consolidates multiple delivery notes into a single order and imports batches idempotently', async () => {
    const repo = new InMemoryOrderRepository();
    const ops = new QuoteAndMultiDocUseCase(
      repo,
      { now: () => new Date('2026-07-05T10:00:00.000Z') },
      'ADVANCED',
    );

    const batch1 = await ops.importOrdersBatch({
      documents: [
        {
          id: 'rem-10',
          documentKind: 'DELIVERY_NOTE',
          currency: 'MXN',
          customerId: 'cust-9',
          externalImportRef: 'EXT-REM-10',
          lines: [{ lineId: 'l1', productId: 'p1', name: 'Arena m3', quantity: 2, unitPriceCents: 45_000 }],
        },
        {
          id: 'rem-11',
          documentKind: 'DELIVERY_NOTE',
          currency: 'MXN',
          customerId: 'cust-9',
          externalImportRef: 'EXT-REM-11',
          lines: [{ lineId: 'l1', productId: 'p2', name: 'Grava m3', quantity: 1, unitPriceCents: 50_000 }],
        },
      ],
    });
    expect(batch1.created).toHaveLength(2);
    expect(batch1.skippedDuplicates).toHaveLength(0);

    // Re-importing same externalImportRef skips duplicates
    const batch2 = await ops.importOrdersBatch({
      documents: [
        {
          id: 'rem-10-dup',
          documentKind: 'DELIVERY_NOTE',
          currency: 'MXN',
          customerId: 'cust-9',
          externalImportRef: 'EXT-REM-10',
          lines: [{ lineId: 'l1', productId: 'p1', name: 'Arena m3', quantity: 2, unitPriceCents: 45_000 }],
        },
      ],
    });
    expect(batch2.created).toHaveLength(0);
    expect(batch2.skippedDuplicates).toEqual(['rem-10-dup']);

    const consolidated = await ops.consolidateOrders({
      consolidatedOrderId: 'ord-multi-1',
      sourceOrderIds: ['rem-10', 'rem-11'],
    });
    expect(consolidated.sourceDocumentIds).toEqual(['rem-10', 'rem-11']);
    expect(consolidated.lines).toHaveLength(2);
    expect(consolidated.calculateSummary().total.toCents()).toBe(140_000);
  });
});
