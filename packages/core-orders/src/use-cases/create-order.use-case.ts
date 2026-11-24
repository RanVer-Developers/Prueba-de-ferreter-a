import {
  IClock,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import { OrderCreatedEvent } from '../domain/events/order-events.js';
import {
  isOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import { OrderPricingSummary } from '../domain/services/order-pricing.service.js';
import {
  CreateOrderInput,
  CreateOrderInputSchema,
  parseWithSchema,
} from '../schemas/order-schemas.js';

export interface CreateOrderResult {
  order: Order;
  summary: OrderPricingSummary;
  isReplay: boolean;
}

export class CreateOrderUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly publishEvent?: OrderEventPublisher,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile
  ) {}

  public async execute(input: CreateOrderInput): Promise<CreateOrderResult> {
    const parsed = parseWithSchema(CreateOrderInputSchema, input, 'CreateOrderInput');
    const flags = resolveOrderFeatures(parsed.featureProfile ?? this.defaultProfile);

    if (parsed.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      const existing = await this.orderRepo.findByIdempotencyKey(parsed.idempotencyKey);
      if (existing) {
        return {
          order: existing,
          summary: existing.calculateSummary(),
          isReplay: true,
        };
      }
    }

    const now = this.clock.now();
    const order = Order.create({
      id: parsed.id,
      documentKind: parsed.documentKind,
      orderNumber: parsed.orderNumber,
      channel: parsed.channel,
      currency: parsed.currency,
      customerId: parsed.customerId,
      quoteExpiresAt: parsed.quoteExpiresAt,
      sourceDocumentId: parsed.sourceDocumentId,
      sourceDocumentIds: parsed.sourceDocumentIds,
      externalImportRef: parsed.externalImportRef,
      notes: parsed.notes,
      metadata: parsed.metadata,
      lines: parsed.lines,
      orderDiscounts: parsed.orderDiscounts,
      initialStatus: parsed.initialStatus,
      createdBy: parsed.createdBy,
      idempotencyKey: parsed.idempotencyKey,
      now,
      featureProfile: flags,
    });

    await this.orderRepo.save(order);
    const summary = order.calculateSummary();

    if (this.publishEvent) {
      await this.publishEvent(new OrderCreatedEvent(order, summary, now));
    }

    return {
      order,
      summary,
      isReplay: false,
    };
  }
}
