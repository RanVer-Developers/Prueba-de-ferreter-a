import { describe, expect, it } from 'vitest';
import {
  ConcurrencyError,
  CreateOrderUseCase,
  InMemoryOrderRepository,
  InvalidOrderInputError,
  InvalidOrderStateError,
  ManageOrderExtrasUseCase,
  Order,
  OrderSurchargeSchema,
  SplitOrderUseCase,
} from '../src/index.js';

describe('@modulos/core-orders Audit Remediation Tests', () => {
  it('defaults InMemoryOrderRepository to isolate: true and enforces optimistic concurrency', async () => {
    const repo = new InMemoryOrderRepository();
    await new CreateOrderUseCase(repo).execute({
      id: 'ord-iso',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'A', quantity: 1, unitPriceCents: 100 }],
    });

    const a = (await repo.findById('ord-iso'))!;
    const b = (await repo.findById('ord-iso'))!;
    a.addLine({ lineId: 'l2', productId: 'p2', name: 'B', quantity: 1, unitPriceCents: 200 });
    await repo.save(a);

    b.addLine({ lineId: 'l3', productId: 'p3', name: 'C', quantity: 1, unitPriceCents: 300 });
    await expect(repo.save(b)).rejects.toThrow(ConcurrencyError);
  });

  it('rejects >100% and non-integer FIXED_AMOUNT in OrderSurchargeSchema and validates Order.create', () => {
    expect(() =>
      OrderSurchargeSchema.parse({
        id: 's1',
        code: 'FEE',
        name: 'Fee',
        type: 'PERCENTAGE',
        value: 120,
      })
    ).toThrow();

    expect(() =>
      OrderSurchargeSchema.parse({
        id: 's2',
        code: 'FEE',
        name: 'Fee',
        type: 'FIXED_AMOUNT',
        value: 12.5,
      })
    ).toThrow();

    expect(() => Order.create({ id: '', currency: 'MXN' })).toThrow(InvalidOrderInputError);
  });

  it('prevents non-CANCELLED transitions while parked and returns defensive Date copies', async () => {
    const repo = new InMemoryOrderRepository();
    await new CreateOrderUseCase(repo).execute({
      id: 'ord-park',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'A', quantity: 1, unitPriceCents: 500 }],
      featureProfile: 'ADVANCED',
    });

    const extras = new ManageOrderExtrasUseCase(repo, 'ADVANCED');
    const parked = await extras.parkOrder('ord-park', 'Waiting');

    expect(() => parked.transitionTo('COMPLETED')).toThrow(InvalidOrderStateError);

    const updatedRef = parked.updatedAt;
    updatedRef.setFullYear(1999);
    expect(parked.updatedAt.getFullYear()).not.toBe(1999);

    parked.transitionTo('CANCELLED');
    expect(parked.status).toBe('CANCELLED');
    expect(parked.isParked).toBe(false);
  });

  it('rejects duplicate lineId in SplitOrderUseCase, subtracts fractional quantities cleanly, and clears empty source fees', async () => {
    const repo = new InMemoryOrderRepository();
    await new CreateOrderUseCase(repo).execute({
      id: 'ord-src',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'Queso', quantity: 0.3, unitPriceCents: 1000 }],
      featureProfile: 'ADVANCED',
    });

    const extras = new ManageOrderExtrasUseCase(repo, 'ADVANCED');
    await extras.addSurcharge('ord-src', {
      id: 'sur-1',
      code: 'DELIVERY',
      name: 'Envío',
      type: 'FIXED_AMOUNT',
      value: 500,
    });

    const split = new SplitOrderUseCase(repo, 'ADVANCED');
    await expect(
      split.execute({
        sourceOrderId: 'ord-src',
        targetOrderId: 'ord-dup',
        linesToMove: [
          { lineId: 'l1', quantity: 0.1 },
          { lineId: 'l1', quantity: 0.1 },
        ],
      })
    ).rejects.toThrow(InvalidOrderInputError);

    const partial = await split.execute({
      sourceOrderId: 'ord-src',
      targetOrderId: 'ord-part',
      linesToMove: [{ lineId: 'l1', quantity: 0.1 }],
    });
    expect(partial.sourceOrder.lines[0]?.quantity).toBe(0.2);

    const drained = await split.execute({
      sourceOrderId: 'ord-src',
      targetOrderId: 'ord-rest',
      linesToMove: [{ lineId: 'l1', quantity: 0.2 }],
    });
    expect(drained.sourceOrder.lines).toHaveLength(0);
    expect(drained.sourceOrder.surcharges).toHaveLength(0);
  });
});
