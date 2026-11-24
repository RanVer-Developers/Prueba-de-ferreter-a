import {
  IClock,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import { OrderNotFoundError } from '../domain/errors/order-errors.js';
import { OrderLineRemovedEvent } from '../domain/events/order-events.js';
import {
  isOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import {
  parseWithSchema,
  RemoveOrderLineInput,
  RemoveOrderLineInputSchema,
} from '../schemas/order-schemas.js';

export interface RemoveOrderLineResult {
  order: Order;
  summary: OrderPricingSummary;
  isReplay: boolean;
}

export class RemoveOrderLineUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly publishEvent?: OrderEventPublisher,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile
  ) {}

  public async execute(input: RemoveOrderLineInput): Promise<RemoveOrderLineResult> {
    const parsed = parseWithSchema(RemoveOrderLineInputSchema, input, 'RemoveOrderLineInput');
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
      return {
        order,
        summary: order.calculateSummary(),
        isReplay: true,
      };
    }

    const now = this.clock.now();
    order.removeLine(parsed.lineId, {
      now,
      flags,
      idempotencyKey: parsed.idempotencyKey,
    });

    await this.orderRepo.save(order);
    const summary = order.calculateSummary();

    if (this.publishEvent) {
      await this.publishEvent(new OrderLineRemovedEvent(order.id, parsed.lineId, summary, now));
    }

    return {
      order,
      summary,
      isReplay: false,
    };
  }
}
