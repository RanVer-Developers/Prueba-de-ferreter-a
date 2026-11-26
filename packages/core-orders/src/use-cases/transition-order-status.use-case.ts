import {
  IClock,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import { OrderNotFoundError } from '../domain/errors/order-errors.js';
import { OrderStatusChangedEvent } from '../domain/events/order-events.js';
import {
  isOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import {
  OrderStatus,
  parseWithSchema,
  TransitionOrderStatusInput,
  TransitionOrderStatusInputSchema,
} from '../schemas/order-schemas.js';

export interface TransitionOrderStatusResult {
  order: Order;
  previousStatus: OrderStatus;
  currentStatus: OrderStatus;
  summary: OrderPricingSummary;
  isReplay: boolean;
}

export class TransitionOrderStatusUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly publishEvent?: OrderEventPublisher,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile
  ) {}

  public async execute(input: TransitionOrderStatusInput): Promise<TransitionOrderStatusResult> {
    const parsed = parseWithSchema(
      TransitionOrderStatusInputSchema,
      input,
      'TransitionOrderStatusInput'
    );
    const flags = resolveOrderFeatures(parsed.featureProfile ?? this.defaultProfile);

    const order = await this.orderRepo.findById(parsed.orderId);
    if (!order) {
      throw new OrderNotFoundError(parsed.orderId);
    }

    if (
      parsed.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      order.hasProcessedOperation(parsed.idempotencyKey)
    ) {
      const history = order.statusHistory;
      const lastEntry = history[history.length - 1];
      return {
        order,
        previousStatus: lastEntry?.from ?? order.status,
        currentStatus: order.status,
        summary: order.calculateSummary(),
        isReplay: true,
      };
    }

    const now = this.clock.now();
    const previousStatus = order.transitionTo(parsed.targetStatus, {
      actor: parsed.actor,
      reason: parsed.reason,
      now,
      flags,
      idempotencyKey: parsed.idempotencyKey,
    });

    await this.orderRepo.save(order);
    const summary = order.calculateSummary();

    if (this.publishEvent) {
      await this.publishEvent(
        new OrderStatusChangedEvent(
          order.id,
          previousStatus,
          order.status,
          summary,
          parsed.actor,
          parsed.reason,
          now
        )
      );
    }

    return {
      order,
      previousStatus,
      currentStatus: order.status,
      summary,
      isReplay: false,
    };
  }
}
