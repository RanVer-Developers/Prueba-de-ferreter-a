import { z } from 'zod';
import { IClock, IOrderRepository, SystemClock } from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import {
  InvalidOrderInputError,
  OrderLineNotFoundError,
  OrderNotFoundError,
} from '../domain/errors/order-errors.js';
import {
  OrderFeatureProfile,
  assertOrderFeatureEnabled,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import {
  FulfillmentDetails,
  FulfillmentDetailsSchema,
  OrderFeatureProfileSchema,
  OrderSurcharge,
  OrderSurchargeSchema,
  parseWithSchema,
} from '../schemas/order-schemas.js';

const NonEmptyIdSchema = z.string().trim().min(1, 'Identifier must be a non-empty string.');
const OptionalReasonSchema = z.string().trim().min(1).optional();

const SplitOrderInputSchema = z.object({
  sourceOrderId: z.string().trim().min(1),
  targetOrderId: z.string().trim().min(1),
  targetOrderNumber: z.string().trim().min(1).optional(),
  linesToMove: z
    .array(
      z.object({
        lineId: z.string().trim().min(1),
        quantity: z.number().finite().positive().optional(),
      })
    )
    .min(1),
  featureProfile: OrderFeatureProfileSchema,
});

export interface SplitOrderInput {
  sourceOrderId: string;
  targetOrderId: string;
  targetOrderNumber?: string;
  linesToMove: Array<{ lineId: string; quantity?: number }>;
  featureProfile?: OrderFeatureProfile;
}

export class ManageOrderExtrasUseCase {
  private readonly clock: IClock;

  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly defaultProfile?: OrderFeatureProfile,
    clock?: IClock
  ) {
    this.clock = clock ?? SystemClock;
  }

  public async parkOrder(
    orderId: string,
    reason?: string,
    profile?: OrderFeatureProfile
  ): Promise<Order> {
    const cleanId = parseWithSchema(NonEmptyIdSchema, orderId, 'orderId');
    const cleanReason =
      reason !== undefined ? parseWithSchema(OptionalReasonSchema, reason, 'park reason') : undefined;
    const parsedProfile = parseWithSchema(OrderFeatureProfileSchema, profile, 'featureProfile');

    const order = await this.orderRepo.findById(cleanId);
    if (!order) throw new OrderNotFoundError(cleanId);
    const flags = resolveOrderFeatures(parsedProfile ?? this.defaultProfile);
    order.park(cleanReason, { now: this.clock.now(), flags });
    await this.orderRepo.save(order);
    return order;
  }

  public async resumeOrder(orderId: string, profile?: OrderFeatureProfile): Promise<Order> {
    const cleanId = parseWithSchema(NonEmptyIdSchema, orderId, 'orderId');
    const parsedProfile = parseWithSchema(OrderFeatureProfileSchema, profile, 'featureProfile');

    const order = await this.orderRepo.findById(cleanId);
    if (!order) throw new OrderNotFoundError(cleanId);
    const flags = resolveOrderFeatures(parsedProfile ?? this.defaultProfile);
    order.resume({ now: this.clock.now(), flags });
    await this.orderRepo.save(order);
    return order;
  }

  public async setFulfillment(
    orderId: string,
    details: FulfillmentDetails,
    profile?: OrderFeatureProfile
  ): Promise<Order> {
    const cleanId = parseWithSchema(NonEmptyIdSchema, orderId, 'orderId');
    const parsedProfile = parseWithSchema(OrderFeatureProfileSchema, profile, 'featureProfile');

    const order = await this.orderRepo.findById(cleanId);
    if (!order) throw new OrderNotFoundError(cleanId);
    const flags = resolveOrderFeatures(parsedProfile ?? this.defaultProfile);
    const parsed = parseWithSchema(FulfillmentDetailsSchema, details, 'fulfillment details');
    order.setFulfillment(parsed, { now: this.clock.now(), flags });
    await this.orderRepo.save(order);
    return order;
  }

  public async addSurcharge(
    orderId: string,
    surcharge: OrderSurcharge,
    profile?: OrderFeatureProfile
  ): Promise<Order> {
    const cleanId = parseWithSchema(NonEmptyIdSchema, orderId, 'orderId');
    const parsedProfile = parseWithSchema(OrderFeatureProfileSchema, profile, 'featureProfile');

    const order = await this.orderRepo.findById(cleanId);
    if (!order) throw new OrderNotFoundError(cleanId);
    const flags = resolveOrderFeatures(parsedProfile ?? this.defaultProfile);
    const parsed = parseWithSchema(OrderSurchargeSchema, surcharge, 'order surcharge');
    order.addSurcharge(parsed, { now: this.clock.now(), flags });
    await this.orderRepo.save(order);
    return order;
  }

  public async removeSurcharge(
    orderId: string,
    surchargeId: string,
    profile?: OrderFeatureProfile
  ): Promise<Order> {
    const cleanId = parseWithSchema(NonEmptyIdSchema, orderId, 'orderId');
    const cleanSurchargeId = parseWithSchema(NonEmptyIdSchema, surchargeId, 'surchargeId');
    const parsedProfile = parseWithSchema(OrderFeatureProfileSchema, profile, 'featureProfile');

    const order = await this.orderRepo.findById(cleanId);
    if (!order) throw new OrderNotFoundError(cleanId);
    const flags = resolveOrderFeatures(parsedProfile ?? this.defaultProfile);
    order.removeSurcharge(cleanSurchargeId, { now: this.clock.now(), flags });
    await this.orderRepo.save(order);
    return order;
  }
}

export class SplitOrderUseCase {
  private readonly clock: IClock;

  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly defaultProfile?: OrderFeatureProfile,
    clock?: IClock
  ) {
    this.clock = clock ?? SystemClock;
  }

  public async execute(rawInput: SplitOrderInput): Promise<{ sourceOrder: Order; targetOrder: Order }> {
    const input = parseWithSchema(SplitOrderInputSchema, rawInput, 'split order input');
    const flags = resolveOrderFeatures(input.featureProfile ?? this.defaultProfile);
    assertOrderFeatureEnabled(flags, 'orderSplitting');

    if (input.sourceOrderId === input.targetOrderId) {
      throw new InvalidOrderInputError('Target order id must differ from source order id.');
    }

    const seenLineIds = new Set<string>();
    for (const req of input.linesToMove) {
      if (seenLineIds.has(req.lineId)) {
        throw new InvalidOrderInputError(`Duplicate lineId '${req.lineId}' in split request.`);
      }
      seenLineIds.add(req.lineId);
    }

    const sourceOrder = await this.orderRepo.findById(input.sourceOrderId);
    if (!sourceOrder) throw new OrderNotFoundError(input.sourceOrderId);
    if (await this.orderRepo.findById(input.targetOrderId)) {
      throw new InvalidOrderInputError(`Target order '${input.targetOrderId}' already exists.`);
    }

    const plannedMoves = input.linesToMove.map((req) => {
      const existing = sourceOrder.lines.find((l) => l.lineId === req.lineId);
      if (!existing) {
        throw new OrderLineNotFoundError(sourceOrder.id, req.lineId);
      }
      const moveQty = req.quantity ?? existing.quantity;
      const existingMicro = Math.round(existing.quantity * 1_000_000);
      const moveMicro = Math.round(moveQty * 1_000_000);
      if (moveMicro > existingMicro) {
        throw new InvalidOrderInputError(
          `Cannot move quantity ${moveQty} for line '${req.lineId}' (only ${existing.quantity} available).`
        );
      }
      const remainingQty = (existingMicro - moveMicro) / 1_000_000;
      return { existing, moveQty, remainingQty };
    });

    const now = this.clock.now();
    const linesForTarget = plannedMoves.map(({ existing, moveQty }) => ({
      lineId: existing.lineId,
      productId: existing.productId,
      sku: existing.sku,
      name: existing.name,
      quantity: moveQty,
      unitPriceCents: existing.unitPriceCents,
      taxes: existing.taxes.map((t) => ({ ...t })),
      discounts: existing.discounts.map((d) => ({ ...d })),
      notes: existing.notes,
      metadata: existing.metadata ? { ...existing.metadata } : undefined,
    }));

    const targetOrder = Order.create({
      id: input.targetOrderId,
      orderNumber: input.targetOrderNumber,
      channel: sourceOrder.channel,
      currency: sourceOrder.currency,
      customerId: sourceOrder.customerId,
      fulfillment: sourceOrder.fulfillment,
      lines: linesForTarget,
      now,
      featureProfile: flags,
    });

    const sourceBeforeSnapshot = sourceOrder.toSnapshot();

    for (const { existing, remainingQty } of plannedMoves) {
      if (remainingQty <= 0) {
        sourceOrder.removeLine(existing.lineId, { now, flags });
      } else {
        sourceOrder.updateLine(
          existing.lineId,
          { quantity: remainingQty },
          { now, flags }
        );
      }
    }

    if (sourceOrder.lines.length === 0) {
      for (const discount of sourceOrder.orderDiscounts) {
        sourceOrder.removeOrderDiscount(discount.id, { now, flags });
      }
      for (const surcharge of sourceOrder.surcharges) {
        sourceOrder.removeSurcharge(surcharge.id, { now, flags });
      }
    }

    await this.orderRepo.save(sourceOrder);
    try {
      await this.orderRepo.save(targetOrder);
    } catch (err) {
      const rollbackOrder = Order.fromSnapshot({
        ...sourceBeforeSnapshot,
        version: sourceOrder.version,
      });
      await this.orderRepo.save(rollbackOrder);
      throw err;
    }

    return { sourceOrder, targetOrder };
  }
}
