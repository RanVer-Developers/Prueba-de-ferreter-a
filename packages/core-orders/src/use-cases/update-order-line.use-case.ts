import {
  IClock,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from '../contracts/order-contracts.js';
import { Order, OrderLine } from '../domain/entities/order.js';
import { OrderLineNotFoundError, OrderNotFoundError } from '../domain/errors/order-errors.js';
import { OrderLineUpdatedEvent } from '../domain/events/order-events.js';
import {
  isOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import {
  parseWithSchema,
  UpdateOrderLineInput,
  UpdateOrderLineInputSchema,
} from '../schemas/order-schemas.js';

export interface UpdateOrderLineResult {
  order: Order;
  line: OrderLine;
  summary: OrderPricingSummary;
  isReplay: boolean;
}

export class UpdateOrderLineUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly publishEvent?: OrderEventPublisher,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile
  ) {}

  public async execute(input: UpdateOrderLineInput): Promise<UpdateOrderLineResult> {
    const parsed = parseWithSchema(UpdateOrderLineInputSchema, input, 'UpdateOrderLineInput');
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
      const existingLine = order.lines.find((l) => l.lineId === parsed.lineId);
      if (!existingLine) {
        throw new OrderLineNotFoundError(order.id, parsed.lineId);
      }
      return {
        order,
        line: existingLine,
        summary: order.calculateSummary(),
        isReplay: true,
      };
    }

    const now = this.clock.now();
    const line = order.updateLine(
      parsed.lineId,
      {
        quantity: parsed.quantity,
        unitPriceCents: parsed.unitPriceCents,
        taxes: parsed.taxes,
        notes: parsed.notes,
        metadata: parsed.metadata,
      },
      {
        now,
        flags,
        idempotencyKey: parsed.idempotencyKey,
      }
    );

    await this.orderRepo.save(order);
    const summary = order.calculateSummary();

    if (this.publishEvent) {
      await this.publishEvent(new OrderLineUpdatedEvent(order.id, line, summary, now));
    }

    return {
      order,
      line,
      summary,
      isReplay: false,
    };
  }
}
