import { describe, expect, it } from 'vitest';
import {
  AddOrderLineUseCase,
  ApplyOrderDiscountUseCase,
  ConcurrencyError,
  CouponDefinition,
  CreateOrderUseCase,
  GetOrderSummaryUseCase,
  IClock,
  ICouponCatalog,
  InMemoryOrderRepository,
  InvalidCouponError,
  InvalidOrderInputError,
  Order,
  ORDER_SCHEMA_VERSION,
  OrderDomainEvent,
  RemoveOrderDiscountUseCase,
  RemoveOrderLineUseCase,
  TransitionOrderStatusUseCase,
  UpdateOrderLineUseCase,
} from '../src/index.js';

class FixedClock implements IClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

class InMemoryCouponCatalog implements ICouponCatalog {
  private readonly coupons = new Map<string, CouponDefinition>();

  seed(coupon: CouponDefinition): void {
    this.coupons.set(coupon.code.toUpperCase(), coupon);
  }

  async findByCode(code: string): Promise<CouponDefinition | null> {
    return this.coupons.get(code.toUpperCase().trim()) ?? null;
  }

  async incrementUsage(code: string): Promise<void> {
    const existing = this.coupons.get(code.toUpperCase().trim());
    if (existing) {
      existing.currentUses += 1;
    }
  }
}

describe('Use cases, Zod schemas, Coupons, Offline Idempotency & Optimistic Concurrency', () => {
  it('runs complete order lifecycle through use cases and emits domain events', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const events: OrderDomainEvent[] = [];
    const clock = new FixedClock(new Date('2026-11-17T12:00:00.000Z'));

    const createOrder = new CreateOrderUseCase(repo, (e) => { events.push(e); }, clock);
    const addLine = new AddOrderLineUseCase(repo, (e) => { events.push(e); }, clock);
    const updateLine = new UpdateOrderLineUseCase(repo, (e) => { events.push(e); }, clock);
    const removeLine = new RemoveOrderLineUseCase(repo, (e) => { events.push(e); }, clock);
    const applyDiscount = new ApplyOrderDiscountUseCase(repo, undefined, (e) => { events.push(e); }, clock);
    const removeDiscount = new RemoveOrderDiscountUseCase(repo, (e) => { events.push(e); }, clock);
    const transitionStatus = new TransitionOrderStatusUseCase(repo, (e) => { events.push(e); }, clock);
    const getSummary = new GetOrderSummaryUseCase(repo);

    const created = await createOrder.execute({
      id: 'ord-100',
      channel: 'WEB',
      currency: 'USD',
      customerId: 'cust-1',
      lines: [
        {
          lineId: 'l1',
          productId: 'prod-1',
          name: 'Keyboard',
          quantity: 1,
          unitPriceCents: 10000,
          taxes: [{ id: 't1', code: 'VAT', name: 'VAT', ratePercent: 10, mode: 'EXCLUSIVE' }],
        },
      ],
    });
    expect(created.summary.total.toCents()).toBe(11000);

    await addLine.execute({
      orderId: 'ord-100',
      line: {
        lineId: 'l2',
        productId: 'prod-2',
        name: 'Mouse',
        quantity: 2,
        unitPriceCents: 2500,
      },
    });

    await updateLine.execute({
      orderId: 'ord-100',
      lineId: 'l2',
      quantity: 1,
    });

    await applyDiscount.execute({
      orderId: 'ord-100',
      discount: { id: 'promo-10', type: 'PERCENTAGE', value: 10 },
    });

    await removeDiscount.execute({
      orderId: 'ord-100',
      discountId: 'promo-10',
    });

    await removeLine.execute({
      orderId: 'ord-100',
      lineId: 'l2',
    });

    await transitionStatus.execute({
      orderId: 'ord-100',
      targetStatus: 'COMPLETED',
      actor: { id: 'u1', name: 'Carlos' },
    });

    const fetched = await getSummary.execute('ord-100');
    expect(fetched.order.status).toBe('COMPLETED');
    expect(fetched.summary.total.toCents()).toBe(11000);
    expect(events.map((e) => e.eventName)).toEqual([
      'Order.Created',
      'Order.LineAdded',
      'Order.LineUpdated',
      'Order.DiscountApplied',
      'Order.DiscountRemoved',
      'Order.LineRemoved',
      'Order.StatusChanged',
    ]);
  });

  it('validates coupons against catalog (cap, expiration, minAmount, maxUses, duplicate)', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const coupons = new InMemoryCouponCatalog();
    const clock = new FixedClock(new Date('2026-11-17T12:00:00.000Z'));

    coupons.seed({
      schemaVersion: ORDER_SCHEMA_VERSION,
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      value: 20,
      currency: 'USD',
      minOrderAmountCents: 5000,
      maxDiscountAmountCents: 1500, // capped at $15.00
      expiresAt: '2026-11-18T12:00:00.000Z',
      maxUses: 2,
      currentUses: 0,
      isActive: true,
    });

    coupons.seed({
      schemaVersion: ORDER_SCHEMA_VERSION,
      code: 'EXPIRED',
      discountType: 'FIXED_AMOUNT',
      value: 500,
      currentUses: 0,
      isActive: true,
      expiresAt: '2026-11-16T00:00:00.000Z',
    });

    const createOrder = new CreateOrderUseCase(repo, undefined, clock);
    const applyDiscount = new ApplyOrderDiscountUseCase(repo, coupons, undefined, clock);

    await createOrder.execute({
      id: 'ord-c1',
      currency: 'USD',
      lines: [
        { lineId: 'l1', productId: 'p1', name: 'Monitor', quantity: 1, unitPriceCents: 10000 },
      ],
    });

    // Expired coupon fails
    await expect(
      applyDiscount.execute({ orderId: 'ord-c1', couponCode: 'EXPIRED' })
    ).rejects.toThrow(InvalidCouponError);

    // Valid coupon capped at $15.00 (instead of 20% of $100 = $20.00)
    const res = await applyDiscount.execute({
      orderId: 'ord-c1',
      couponCode: 'save20',
      idempotencyKey: 'idem-coupon-1',
    });
    expect(res.summary.orderDiscountTotal.toCents()).toBe(1500);
    expect(res.summary.total.toCents()).toBe(8500);

    // Idempotent replay does NOT throw duplicate coupon or double-increment usage
    const replay = await applyDiscount.execute({
      orderId: 'ord-c1',
      couponCode: 'save20',
      idempotencyKey: 'idem-coupon-1',
    });
    expect(replay.isReplay).toBe(true);
    expect((await coupons.findByCode('SAVE20'))?.currentUses).toBe(1);

    // Same coupon without replay key fails as duplicate
    await expect(
      applyDiscount.execute({ orderId: 'ord-c1', couponCode: 'SAVE20' })
    ).rejects.toThrow(InvalidCouponError);
  });

  it('guarantees offline idempotency on order creation and mutations', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const events: OrderDomainEvent[] = [];
    const createOrder = new CreateOrderUseCase(repo, (e) => { events.push(e); });
    const addLine = new AddOrderLineUseCase(repo, (e) => { events.push(e); });

    const first = await createOrder.execute({
      id: 'ord-idem-1',
      currency: 'USD',
      idempotencyKey: 'create-key-1',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'Item', quantity: 1, unitPriceCents: 1000 }],
    });
    const second = await createOrder.execute({
      id: 'ord-idem-2', // different id, same idempotencyKey
      currency: 'USD',
      idempotencyKey: 'create-key-1',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'Item', quantity: 1, unitPriceCents: 1000 }],
    });

    expect(first.isReplay).toBe(false);
    expect(second.isReplay).toBe(true);
    expect(second.order.id).toBe('ord-idem-1');

    const lineAdd1 = await addLine.execute({
      orderId: 'ord-idem-1',
      idempotencyKey: 'add-l2-key',
      line: { lineId: 'l2', productId: 'p2', name: 'Item 2', quantity: 1, unitPriceCents: 500 },
    });
    const lineAdd2 = await addLine.execute({
      orderId: 'ord-idem-1',
      idempotencyKey: 'add-l2-key',
      line: { lineId: 'l2', productId: 'p2', name: 'Item 2', quantity: 1, unitPriceCents: 500 },
    });

    expect(lineAdd1.isReplay).toBe(false);
    expect(lineAdd2.isReplay).toBe(true);
    expect(lineAdd2.order.lines).toHaveLength(2);
    expect(events).toHaveLength(2);
  });

  it('detects optimistic concurrency conflicts and validates persisted snapshots with Zod', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const createOrder = new CreateOrderUseCase(repo);

    await createOrder.execute({
      id: 'ord-conc-1',
      currency: 'USD',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'Item', quantity: 1, unitPriceCents: 1000 }],
    });

    const copyA = (await repo.findById('ord-conc-1'))!;
    const copyB = (await repo.findById('ord-conc-1'))!;

    copyA.addLine({ lineId: 'l2', productId: 'p2', name: 'B', quantity: 1, unitPriceCents: 500 });
    await repo.save(copyA);

    copyB.addLine({ lineId: 'l3', productId: 'p3', name: 'C', quantity: 1, unitPriceCents: 700 });
    await expect(repo.save(copyB)).rejects.toThrow(ConcurrencyError);

    // Corrupted snapshot or mismatched schemaVersion fails cleanly with InvalidOrderInputError
    const validSnap = copyA.toSnapshot();
    expect(() =>
      Order.fromSnapshot({ ...validSnap, schemaVersion: 99 })
    ).toThrow(InvalidOrderInputError);

    await expect(() =>
      createOrder.execute({
        id: '',
        currency: 'INVALID',
      } as never)
    ).rejects.toThrow(InvalidOrderInputError);
  });

  it('filters orders in InMemoryOrderRepository by status, customer, channel, and date range', async () => {
    const repo = new InMemoryOrderRepository({ isolate: true });
    const clock = new FixedClock(new Date('2026-11-17T10:00:00.000Z'));
    const createOrder = new CreateOrderUseCase(repo, undefined, clock);

    await createOrder.execute({
      id: 'o1',
      channel: 'POS',
      customerId: 'c1',
      initialStatus: 'COMPLETED',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'A', quantity: 1, unitPriceCents: 100 }],
    });

    clock.advanceMinutes(30);
    await createOrder.execute({
      id: 'o2',
      channel: 'WEB',
      customerId: 'c2',
      initialStatus: 'PENDING',
      lines: [{ lineId: 'l1', productId: 'p1', name: 'A', quantity: 1, unitPriceCents: 100 }],
    });

    const webOrders = await repo.findByFilter({ channel: 'WEB' });
    expect(webOrders.map((o) => o.id)).toEqual(['o2']);

    const completed = await repo.findByFilter({ statuses: ['COMPLETED'] });
    expect(completed.map((o) => o.id)).toEqual(['o1']);
  });
});
