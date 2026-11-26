import { z } from 'zod';
import { IClock, IOrderRepository, SystemClock } from '../contracts/order-contracts.js';
import { Order } from '../domain/entities/order.js';
import {
  InvalidOrderInputError,
  InvalidOrderStateError,
  OrderNotFoundError,
} from '../domain/errors/order-errors.js';
import {
  assertOrderFeatureEnabled,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../domain/services/order-features.js';
import {
  ActorSummarySchema,
  CreateOrderInputSchema,
  OrderChannelSchema,
  OrderFeatureProfileSchema,
  parseWithSchema,
} from '../schemas/order-schemas.js';

export const ConvertQuoteToOrderInputSchema = z.object({
  quoteId: z.string().trim().min(1),
  newOrderId: z.string().trim().min(1),
  newOrderNumber: z.string().trim().min(1).optional(),
  targetKind: z.enum(['ORDER', 'DELIVERY_NOTE']).default('ORDER'),
  initialStatus: z.enum(['DRAFT', 'PENDING', 'COMPLETED']).default('PENDING'),
  actor: ActorSummarySchema.optional(),
  unitPriceOverridesCents: z.record(z.string().trim().min(1), z.number().int().nonnegative()).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});
export type ConvertQuoteToOrderInput = z.input<typeof ConvertQuoteToOrderInputSchema>;

export const ConsolidateOrdersInputSchema = z.object({
  consolidatedOrderId: z.string().trim().min(1),
  consolidatedOrderNumber: z.string().trim().min(1).optional(),
  sourceOrderIds: z.array(z.string().trim().min(1)).min(2, 'At least two documents are required to consolidate.'),
  channel: OrderChannelSchema.default('B2B'),
  actor: ActorSummarySchema.optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  featureProfile: OrderFeatureProfileSchema,
});
export type ConsolidateOrdersInput = z.input<typeof ConsolidateOrdersInputSchema>;

export const ImportOrdersBatchInputSchema = z.object({
  documents: z.array(CreateOrderInputSchema).min(1),
  featureProfile: OrderFeatureProfileSchema,
});
export type ImportOrdersBatchInput = z.input<typeof ImportOrdersBatchInputSchema>;

export interface ImportOrdersBatchResult {
  readonly created: Order[];
  readonly skippedDuplicates: string[];
}

export class QuoteAndMultiDocUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly clock: IClock = SystemClock,
    private readonly defaultProfile?: OrderFeatureProfile,
  ) {}

  public async convertQuoteToOrder(rawInput: ConvertQuoteToOrderInput): Promise<Order> {
    const input = parseWithSchema(ConvertQuoteToOrderInputSchema, rawInput, 'ConvertQuoteToOrderInput');
    const flags = resolveOrderFeatures(input.featureProfile ?? this.defaultProfile);
    assertOrderFeatureEnabled(flags, 'quotes');
    if (input.targetKind === 'DELIVERY_NOTE') {
      assertOrderFeatureEnabled(flags, 'deliveryNotes');
    }

    if (input.idempotencyKey) {
      const replay = await this.orderRepo.findByIdempotencyKey(input.idempotencyKey);
      if (replay) return replay;
    }

    const quote = await this.orderRepo.findById(input.quoteId);
    if (!quote) throw new OrderNotFoundError(input.quoteId);
    if (quote.documentKind !== 'QUOTE') {
      throw new InvalidOrderInputError(`Document '${quote.id}' is not a QUOTE.`);
    }
    if (quote.status === 'CANCELLED' || quote.status === 'EXPIRED') {
      throw new InvalidOrderStateError(quote.id, quote.status, 'convert quote');
    }

    const now = this.clock.now();
    if (quote.quoteExpiresAt && now.getTime() > quote.quoteExpiresAt.getTime()) {
      quote.transitionTo('EXPIRED', { actor: input.actor, reason: 'Quote expired', now, flags });
      await this.orderRepo.save(quote);
      throw new InvalidOrderStateError(quote.id, 'EXPIRED', 'convert expired quote');
    }

    const lines = quote.lines.map((l, idx) => ({
      lineId: `line-${idx + 1}`,
      productId: l.productId,
      sku: l.sku,
      name: l.name,
      quantity: l.quantity,
      unitPriceCents: input.unitPriceOverridesCents?.[l.productId] ?? l.unitPriceCents,
      taxes: l.taxes.map((t) => ({ ...t })),
      discounts: l.discounts.map((d) => ({ ...d })),
      notes: l.notes,
      metadata: l.metadata ? { ...l.metadata } : undefined,
    }));

    const newOrder = Order.create({
      id: input.newOrderId,
      documentKind: input.targetKind,
      orderNumber: input.newOrderNumber,
      channel: quote.channel,
      currency: quote.currency,
      customerId: quote.customerId,
      sourceDocumentId: quote.id,
      notes: quote.notes,
      metadata: quote.metadata ? { ...quote.metadata } : undefined,
      lines,
      orderDiscounts: quote.orderDiscounts.map((d) => ({ ...d })),
      surcharges: quote.surcharges.map((s) => ({ ...s })),
      fulfillment: quote.fulfillment,
      initialStatus: input.initialStatus,
      createdBy: input.actor,
      idempotencyKey: input.idempotencyKey,
      now,
      featureProfile: flags,
    });

    await this.orderRepo.save(newOrder);
    if (quote.status === 'DRAFT' || quote.status === 'PENDING') {
      quote.transitionTo('COMPLETED', {
        actor: input.actor,
        reason: `Converted to ${input.targetKind} ${newOrder.id}`,
        now,
        flags,
      });
      await this.orderRepo.save(quote);
    }

    return newOrder;
  }

  public async consolidateOrders(rawInput: ConsolidateOrdersInput): Promise<Order> {
    const input = parseWithSchema(ConsolidateOrdersInputSchema, rawInput, 'ConsolidateOrdersInput');
    const flags = resolveOrderFeatures(input.featureProfile ?? this.defaultProfile);
    assertOrderFeatureEnabled(flags, 'documentConsolidation');

    if (input.idempotencyKey) {
      const replay = await this.orderRepo.findByIdempotencyKey(input.idempotencyKey);
      if (replay) return replay;
    }

    const sources: Order[] = [];
    for (const id of input.sourceOrderIds) {
      const doc = await this.orderRepo.findById(id);
      if (!doc) throw new OrderNotFoundError(id);
      if (doc.status === 'CANCELLED' || doc.status === 'EXPIRED' || doc.status === 'REFUNDED') {
        throw new InvalidOrderStateError(doc.id, doc.status, 'consolidate');
      }
      sources.push(doc);
    }

    const baseCurrency = sources[0]!.currency;
    const baseCustomer = sources[0]!.customerId;
    for (const doc of sources) {
      if (doc.currency !== baseCurrency) {
        throw new InvalidOrderInputError(
          `Cannot consolidate documents with different currencies (${baseCurrency} vs ${doc.currency}).`,
        );
      }
      if (doc.customerId !== baseCustomer) {
        throw new InvalidOrderInputError(
          `Cannot consolidate documents belonging to different customers.`,
        );
      }
    }

    const now = this.clock.now();
    const consolidatedLines = sources.flatMap((doc) =>
      doc.lines.map((l) => ({
        lineId: `${doc.id}_${l.lineId}`,
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        taxes: l.taxes.map((t) => ({ ...t })),
        discounts: l.discounts.map((d) => ({ ...d })),
        notes: l.notes,
        metadata: l.metadata ? { ...l.metadata } : undefined,
      })),
    );

    const consolidated = Order.create({
      id: input.consolidatedOrderId,
      documentKind: 'ORDER',
      orderNumber: input.consolidatedOrderNumber,
      channel: input.channel,
      currency: baseCurrency,
      customerId: baseCustomer,
      sourceDocumentIds: sources.map((s) => s.id),
      lines: consolidatedLines,
      initialStatus: 'PENDING',
      createdBy: input.actor,
      idempotencyKey: input.idempotencyKey,
      now,
      featureProfile: flags,
    });

    await this.orderRepo.save(consolidated);
    return consolidated;
  }

  public async importOrdersBatch(rawInput: ImportOrdersBatchInput): Promise<ImportOrdersBatchResult> {
    const input = parseWithSchema(ImportOrdersBatchInputSchema, rawInput, 'ImportOrdersBatchInput');
    const flags = resolveOrderFeatures(input.featureProfile ?? this.defaultProfile);
    assertOrderFeatureEnabled(flags, 'documentImport');

    const now = this.clock.now();
    const created: Order[] = [];
    const skippedDuplicates: string[] = [];

    for (const docInput of input.documents) {
      const key = docInput.idempotencyKey ?? docInput.externalImportRef;
      if (key) {
        const existing = await this.orderRepo.findByIdempotencyKey(key);
        if (existing) {
          skippedDuplicates.push(docInput.id);
          continue;
        }
      }
      const existingById = await this.orderRepo.findById(docInput.id);
      if (existingById) {
        skippedDuplicates.push(docInput.id);
        continue;
      }

      const order = Order.create({
        ...docInput,
        idempotencyKey: key,
        now,
        featureProfile: flags,
      });
      await this.orderRepo.save(order);
      created.push(order);
    }

    return { created, skippedDuplicates };
  }
}
