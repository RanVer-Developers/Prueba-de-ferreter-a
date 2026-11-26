import {
  IClock,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import { OrderNotFoundError } from '../domain/errors/order-errors.js';
import { OrderDiscountRemovedEvent } from '../domain/events/order-events.js';
import {
  isOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import {
  parseWithSchema,
  RemoveOrderDiscountInput,
  RemoveOrderDiscountInputSchema,
} from '../schemas/order-schemas.js';

export interface RemoveOrderDiscountResult {
  order: Order;
  summary: OrderPricingSummary;
  isReplay: boolean;
}

export class RemoveOrderDiscountUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly publishEvent?: OrderEventPublisher,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile
  ) {}

  public async execute(input: RemoveOrderDiscountInput): Promise<RemoveOrderDiscountResult> {
    const parsed = parseWithSchema(
      RemoveOrderDiscountInputSchema,
      input,
      'RemoveOrderDiscountInput'
    );
    const flags = resolveOrderFeatures(parsed.featureProfile ?? this.defaultProfile);

    const order = await this.orderRepo.findById(parsed.orderId);
    if (!order) {
      throw new OrderNotFoundError(parsed.orderId);
    }

    const scope: 'ORDER' | 'LINE' = parsed.lineId ? 'LINE' : 'ORDER';

    if (
      parsed.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      order.hasProcessedOperation(parsed.idempotencyKey)
    ) {
      return {
        order,
        summary: order.calculateSummary(),
        isReplay: true,
      };
    }

    const now = this.clock.now();
    if (scope === 'LINE') {
      order.removeLineDiscount(parsed.lineId!, parsed.discountId, {
        now,
        flags,
        idempotencyKey: parsed.idempotencyKey,
      });
    } else {
      order.removeOrderDiscount(parsed.discountId, {
        now,
        flags,
        idempotencyKey: parsed.idempotencyKey,
      });
    }

    await this.orderRepo.save(order);
    const summary = order.calculateSummary();

    if (this.publishEvent) {
      await this.publishEvent(
        new OrderDiscountRemovedEvent(
          order.id,
          parsed.discountId,
          scope,
          summary,
          parsed.lineId,
          now
        )
      );
    }

    return {
      order,
      summary,
      isReplay: false,
    };
  }
}
