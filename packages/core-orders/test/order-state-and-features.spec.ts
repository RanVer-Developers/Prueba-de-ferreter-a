import { describe, expect, it } from 'vitest';
import {
  createOrderFeatureFlags,
  EmptyOrderError,
  FeatureDisabledError,
  InvalidOrderInputError,
  InvalidOrderStateError,
  Order,
} from '../src/index.js';

const ACTOR = { id: 'usr-1', name: 'Ana', role: 'CASHIER' };

describe('Order state machine & FeatureFlags', () => {
  it('enforces BASIC tier restrictions and direct checkout flow', () => {
    const order = Order.create({
      id: 'ord-basic-1',
      currency: 'USD',
      featureProfile: 'BASIC',
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          name: 'Coffee',
          quantity: 1,
          unitPriceCents: 350,
        },
      ],
    });

    expect(() =>
      order.transitionTo('PENDING', { actor: ACTOR, flags: createOrderFeatureFlags('BASIC') })
    ).toThrow(FeatureDisabledError);

    expect(() =>
      order.applyOrderDiscount(
        { id: 'd1', type: 'PERCENTAGE', value: 10 },
        { flags: createOrderFeatureFlags('BASIC') }
      )
    ).toThrow(FeatureDisabledError);

    expect(() =>
      order.addLine(
        {
          lineId: 'l2',
          productId: 'p2',
          name: 'Sugar',
          quantity: 0.5,
          unitPriceCents: 100,
        },
        { flags: createOrderFeatureFlags('BASIC') }
      )
    ).toThrow(FeatureDisabledError);

    order.transitionTo('COMPLETED', {
      actor: ACTOR,
      flags: createOrderFeatureFlags('BASIC'),
    });
    expect(order.status).toBe('COMPLETED');

    expect(() =>
      order.transitionTo('REFUNDED', {
        actor: ACTOR,
        reason: 'Customer return',
        flags: createOrderFeatureFlags('BASIC'),
      })
    ).toThrow(InvalidOrderStateError);
  });

  it('supports full ADVANCED workflow transitions and audit trail', () => {
    const order = Order.create({
      id: 'ord-adv-1',
      currency: 'MXN',
      createdBy: ACTOR,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          name: 'Sandwich',
          quantity: 1,
          unitPriceCents: 8500,
        },
      ],
    });

    order.transitionTo('PENDING', { actor: ACTOR });
    // Reopen pending order to edit
    order.transitionTo('DRAFT', { actor: ACTOR, reason: 'Add extra item' });
    order.addLine({
      lineId: 'l2',
      productId: 'p2',
      name: 'Juice',
      quantity: 1,
      unitPriceCents: 3500,
    });

    order.transitionTo('PENDING', { actor: ACTOR });
    order.transitionTo('IN_PROGRESS', { actor: ACTOR });
    order.transitionTo('READY', { actor: ACTOR });
    order.transitionTo('COMPLETED', { actor: ACTOR });

    // Completed orders cannot be edited
    expect(() =>
      order.addLine({
        lineId: 'l3',
        productId: 'p3',
        name: 'Cookie',
        quantity: 1,
        unitPriceCents: 1500,
      })
    ).toThrow(InvalidOrderStateError);

    // Refund requires a reason
    expect(() => order.transitionTo('REFUNDED', { actor: ACTOR })).toThrow(InvalidOrderInputError);

    order.transitionTo('REFUNDED', { actor: ACTOR, reason: 'Damaged item' });
    expect(order.status).toBe('REFUNDED');
    expect(order.statusHistory).toHaveLength(8);
  });

  it('prevents confirming or completing an empty order, but allows cancelling draft', () => {
    const emptyOrder = Order.create({
      id: 'ord-empty',
      currency: 'USD',
    });

    expect(() => emptyOrder.transitionTo('PENDING')).toThrow(EmptyOrderError);
    expect(() => emptyOrder.transitionTo('COMPLETED')).toThrow(EmptyOrderError);

    emptyOrder.transitionTo('CANCELLED', { reason: 'Customer abandoned cart' });
    expect(emptyOrder.status).toBe('CANCELLED');
    expect(() => emptyOrder.transitionTo('DRAFT')).toThrow(InvalidOrderStateError);
  });
});
