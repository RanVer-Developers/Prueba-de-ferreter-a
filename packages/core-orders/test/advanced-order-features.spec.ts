import { describe, expect, it } from 'vitest';
import {
  CreateOrderUseCase,
  FeatureDisabledError,
  InMemoryOrderRepository,
  ManageOrderExtrasUseCase,
  Order,
  SplitOrderUseCase,
} from '../src/index.js';

describe('@modulos/core-orders: Flagged Enhancements (Park, Fulfillment, Surcharges, Split)', () => {
  it('supports parking/resuming orders, fulfillment details, surcharges, and order splitting', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const create = new CreateOrderUseCase(repo);
    const extras = new ManageOrderExtrasUseCase(repo, 'ADVANCED');
    const split = new SplitOrderUseCase(repo, 'ADVANCED');

    await create.execute({
      id: 'ord-1',
      currency: 'MXN',
      lines: [
        { lineId: 'l1', productId: 'p1', name: 'Taco', quantity: 4, unitPriceCents: 2500 },
        { lineId: 'l2', productId: 'p2', name: 'Agua', quantity: 2, unitPriceCents: 2000 },
      ],
      featureProfile: 'ADVANCED',
    });

    // Park & resume
    const parked = await extras.parkOrder('ord-1', 'Cliente fue por cartera');
    expect(parked.isParked).toBe(true);
    expect(parked.parkReason).toBe('Cliente fue por cartera');
    const resumed = await extras.resumeOrder('ord-1');
    expect(resumed.isParked).toBe(false);

    // Fulfillment
    const withFulfillment = await extras.setFulfillment('ord-1', {
      mode: 'DINE_IN',
      tableNumber: 'MESA-4',
    });
    expect(withFulfillment.fulfillment?.tableNumber).toBe('MESA-4');

    // Surcharge (10% service charge)
    const withSurcharge = await extras.addSurcharge('ord-1', {
      id: 'sur-srv',
      code: 'SERVICE',
      name: 'Servicio',
      type: 'PERCENTAGE',
      value: 10,
    });
    // Subtotal: 4*2500 + 2*2000 = 14000; 10% surcharge = 1400; total = 15400
    const summary = withSurcharge.calculateSummary();
    expect(summary.surchargeTotal.toCents()).toBe(1400);
    expect(summary.total.toCents()).toBe(15400);

    // Snapshot preserves new fields
    const rehydrated = Order.fromSnapshot(withSurcharge.toSnapshot());
    expect(rehydrated.fulfillment?.tableNumber).toBe('MESA-4');
    expect(rehydrated.surcharges).toHaveLength(1);

    // Split 2 Tacos into ord-2
    const { sourceOrder, targetOrder } = await split.execute({
      sourceOrderId: 'ord-1',
      targetOrderId: 'ord-2',
      linesToMove: [{ lineId: 'l1', quantity: 2 }],
    });
    expect(sourceOrder.lines.find((l) => l.lineId === 'l1')?.quantity).toBe(2);
    expect(targetOrder.lines.find((l) => l.lineId === 'l1')?.quantity).toBe(2);
    expect(targetOrder.fulfillment?.tableNumber).toBe('MESA-4');
  });

  it('respects BASIC/INTERMEDIATE feature flags for surcharges, fulfillment, and splitting', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const create = new CreateOrderUseCase(repo);
    await create.execute({
      id: 'ord-b',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'Item', quantity: 2, unitPriceCents: 1000 }],
    });

    const extrasBasic = new ManageOrderExtrasUseCase(repo, 'BASIC');
    await expect(
      extrasBasic.setFulfillment('ord-b', { mode: 'DELIVERY' })
    ).rejects.toThrow(FeatureDisabledError);
    await expect(
      extrasBasic.addSurcharge('ord-b', {
        id: 's1',
        code: 'FEE',
        name: 'Fee',
        type: 'FIXED_AMOUNT',
        value: 500,
      })
    ).rejects.toThrow(FeatureDisabledError);

    const splitInterm = new SplitOrderUseCase(repo, 'INTERMEDIATE');
    await expect(
      splitInterm.execute({
        sourceOrderId: 'ord-b',
        targetOrderId: 'ord-b2',
        linesToMove: [{ lineId: 'l1', quantity: 1 }],
      })
    ).rejects.toThrow(FeatureDisabledError);
  });
});
