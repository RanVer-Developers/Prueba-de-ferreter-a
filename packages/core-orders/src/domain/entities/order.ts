import { z } from 'zod';
import {
  ActorSummary,
  CreateOrderInputSchema,
  DiscountRule,
  DiscountRuleSchema,
  FulfillmentDetails,
  FulfillmentDetailsSchema,
  ORDER_SCHEMA_VERSION,
  OrderChannel,
  OrderDocumentKind,
  OrderLineInput,
  OrderLineInputSchema,
  OrderMetadata,
  OrderMetadataSchema,
  OrderSnapshot,
  OrderSnapshotSchema,
  OrderStatus,
  OrderStatusChangeRecord,
  OrderSurcharge,
  OrderSurchargeSchema,
  ParsedOrderLineInput,
  parseWithSchema,
  TaxRule,
  TaxRuleSchema,
} from '../../schemas/order-schemas.js';
import {
  DuplicateOrderLineError,
  DiscountNotFoundError,
  EmptyOrderError,
  InvalidCouponError,
  InvalidDiscountError,
  InvalidOrderInputError,
  InvalidOrderStateError,
  OrderLineNotFoundError,
} from '../errors/order-errors.js';
import {
  assertOrderFeatureEnabled,
  isOrderFeatureEnabled,
  OrderFeatureFlags,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from '../services/order-features.js';
import {
  OrderPricingService,
  OrderPricingSummary,
} from '../services/order-pricing.service.js';

const CreateOrderCoreSchema = CreateOrderInputSchema.pick({
  id: true,
  documentKind: true,
  orderNumber: true,
  channel: true,
  currency: true,
  customerId: true,
  quoteExpiresAt: true,
  sourceDocumentId: true,
  sourceDocumentIds: true,
  externalImportRef: true,
  notes: true,
  metadata: true,
  initialStatus: true,
  createdBy: true,
  idempotencyKey: true,
});

const UpdateLinePatchSchema = z.object({
  quantity: z.number().finite().positive().optional(),
  unitPriceCents: z.number().int().nonnegative().refine(Number.isSafeInteger).optional(),
  taxes: z.array(TaxRuleSchema).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  metadata: OrderMetadataSchema.optional(),
});

export interface OrderLine {
  readonly lineId: string;
  readonly productId: string;
  readonly sku?: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly taxes: ReadonlyArray<TaxRule>;
  readonly discounts: ReadonlyArray<DiscountRule>;
  readonly notes?: string;
  readonly metadata?: Readonly<OrderMetadata>;
}

interface MutableOrderLine {
  lineId: string;
  productId: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  taxes: TaxRule[];
  discounts: DiscountRule[];
  notes?: string;
  metadata?: OrderMetadata;
}

export interface CreateOrderProps {
  id: string;
  documentKind?: OrderDocumentKind;
  orderNumber?: string;
  channel?: OrderChannel;
  currency?: string;
  customerId?: string;
  quoteExpiresAt?: string;
  sourceDocumentId?: string;
  sourceDocumentIds?: string[];
  externalImportRef?: string;
  notes?: string;
  metadata?: OrderMetadata;
  lines?: OrderLineInput[];
  orderDiscounts?: DiscountRule[];
  surcharges?: OrderSurcharge[];
  fulfillment?: FulfillmentDetails;
  initialStatus?: 'DRAFT' | 'PENDING' | 'COMPLETED';
  createdBy?: ActorSummary;
  idempotencyKey?: string;
  now?: Date;
  featureProfile?: OrderFeatureProfile;
}

const EDITABLE_STATUSES: ReadonlySet<OrderStatus> = new Set(['DRAFT']);

const WORKFLOW_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlyArray<OrderStatus>>> = {
  DRAFT: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['DRAFT', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['READY', 'COMPLETED', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  EXPIRED: [],
};

const BASIC_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlyArray<OrderStatus>>> = {
  DRAFT: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
  EXPIRED: [],
};

function cloneLine(line: OrderLine | MutableOrderLine): OrderLine {
  return {
    ...line,
    taxes: line.taxes.map((t) => ({ ...t })),
    discounts: line.discounts.map((d) => ({ ...d })),
    metadata: line.metadata ? { ...line.metadata } : undefined,
  };
}

/**
 * Aggregate Root representing a commercial order with line items, inclusive/exclusive taxes,
 * line and order-level discounts/coupons, state machine, optimistic concurrency, and offline idempotency.
 */
export class Order {
  public readonly id: string;
  public readonly documentKind: OrderDocumentKind;
  public readonly orderNumber?: string;
  public readonly channel: OrderChannel;
  public readonly currency: string;
  public readonly customerId?: string;
  public readonly quoteExpiresAt?: Date;
  public readonly sourceDocumentId?: string;
  public readonly sourceDocumentIds: ReadonlyArray<string>;
  public readonly externalImportRef?: string;
  public readonly idempotencyKey?: string;
  private readonly _createdAt: Date;

  private _status: OrderStatus;
  private _notes?: string;
  private _metadata?: OrderMetadata;
  private _lines: MutableOrderLine[];
  private _orderDiscounts: DiscountRule[];
  private _surcharges: OrderSurcharge[];
  private _fulfillment?: FulfillmentDetails;
  private _isParked: boolean;
  private _parkedAt?: Date;
  private _parkReason?: string;
  private _statusHistory: OrderStatusChangeRecord[];
  private _processedOperationKeys: Set<string>;
  private _version: number;
  private _persistedVersion: number;
  private _updatedAt: Date;
  private _confirmedAt?: Date;
  private _completedAt?: Date;
  private _cancelledAt?: Date;
  private _refundedAt?: Date;

  private constructor(params: {
    id: string;
    documentKind: OrderDocumentKind;
    orderNumber?: string;
    channel: OrderChannel;
    status: OrderStatus;
    currency: string;
    customerId?: string;
    quoteExpiresAt?: Date;
    sourceDocumentId?: string;
    sourceDocumentIds: string[];
    externalImportRef?: string;
    notes?: string;
    metadata?: OrderMetadata;
    lines: MutableOrderLine[];
    orderDiscounts: DiscountRule[];
    surcharges: OrderSurcharge[];
    fulfillment?: FulfillmentDetails;
    isParked: boolean;
    parkedAt?: Date;
    parkReason?: string;
    statusHistory: OrderStatusChangeRecord[];
    processedOperationKeys: Set<string>;
    idempotencyKey?: string;
    version: number;
    persistedVersion: number;
    createdAt: Date;
    updatedAt: Date;
    confirmedAt?: Date;
    completedAt?: Date;
    cancelledAt?: Date;
    refundedAt?: Date;
  }) {
    this.id = params.id;
    this.documentKind = params.documentKind;
    this.orderNumber = params.orderNumber;
    this.channel = params.channel;
    this._status = params.status;
    this.currency = params.currency;
    this.customerId = params.customerId;
    this.quoteExpiresAt = params.quoteExpiresAt ? new Date(params.quoteExpiresAt.getTime()) : undefined;
    this.sourceDocumentId = params.sourceDocumentId;
    this.sourceDocumentIds = [...params.sourceDocumentIds];
    this.externalImportRef = params.externalImportRef;
    this._notes = params.notes;
    this._metadata = params.metadata ? { ...params.metadata } : undefined;
    this._lines = params.lines;
    this._orderDiscounts = params.orderDiscounts;
    this._surcharges = params.surcharges;
    this._fulfillment = params.fulfillment ? { ...params.fulfillment } : undefined;
    this._isParked = params.isParked;
    this._parkedAt = params.parkedAt ? new Date(params.parkedAt.getTime()) : undefined;
    this._parkReason = params.parkReason;
    this._statusHistory = params.statusHistory;
    this._processedOperationKeys = params.processedOperationKeys;
    this.idempotencyKey = params.idempotencyKey;
    this._version = params.version;
    this._persistedVersion = params.persistedVersion;
    this._createdAt = new Date(params.createdAt.getTime());
    this._updatedAt = new Date(params.updatedAt.getTime());
    this._confirmedAt = params.confirmedAt ? new Date(params.confirmedAt.getTime()) : undefined;
    this._completedAt = params.completedAt ? new Date(params.completedAt.getTime()) : undefined;
    this._cancelledAt = params.cancelledAt ? new Date(params.cancelledAt.getTime()) : undefined;
    this._refundedAt = params.refundedAt ? new Date(params.refundedAt.getTime()) : undefined;
  }

  public static create(props: CreateOrderProps): Order {
    const parsedCore = parseWithSchema(
      CreateOrderCoreSchema,
      {
        id: props.id,
        documentKind: props.documentKind,
        orderNumber: props.orderNumber,
        channel: props.channel,
        currency: props.currency,
        customerId: props.customerId,
        quoteExpiresAt: props.quoteExpiresAt,
        sourceDocumentId: props.sourceDocumentId,
        sourceDocumentIds: props.sourceDocumentIds,
        externalImportRef: props.externalImportRef,
        notes: props.notes,
        metadata: props.metadata,
        initialStatus: props.initialStatus,
        createdBy: props.createdBy,
        idempotencyKey: props.idempotencyKey,
      },
      'CreateOrderProps'
    );
    const flags = resolveOrderFeatures(props.featureProfile);
    if (parsedCore.documentKind === 'QUOTE') {
      assertOrderFeatureEnabled(flags, 'quotes');
    } else if (parsedCore.documentKind === 'DELIVERY_NOTE') {
      assertOrderFeatureEnabled(flags, 'deliveryNotes');
    }
    const now = props.now ? new Date(props.now.getTime()) : new Date();

    const order = new Order({
      id: parsedCore.id,
      documentKind: parsedCore.documentKind,
      orderNumber: parsedCore.orderNumber,
      channel: parsedCore.channel,
      status: 'DRAFT',
      currency: parsedCore.currency,
      customerId: parsedCore.customerId,
      quoteExpiresAt: parsedCore.quoteExpiresAt ? new Date(parsedCore.quoteExpiresAt) : undefined,
      sourceDocumentId: parsedCore.sourceDocumentId,
      sourceDocumentIds: parsedCore.sourceDocumentIds ?? [],
      externalImportRef: parsedCore.externalImportRef,
      notes: parsedCore.notes,
      metadata: parsedCore.metadata ? { ...parsedCore.metadata } : undefined,
      lines: [],
      orderDiscounts: [],
      surcharges: [],
      fulfillment: props.fulfillment
        ? parseWithSchema(FulfillmentDetailsSchema, props.fulfillment, 'fulfillment details')
        : undefined,
      isParked: false,
      statusHistory: isOrderFeatureEnabled(flags, 'auditTrail')
        ? [
            {
              from: null,
              to: 'DRAFT',
              changedAt: now.toISOString(),
              changedBy: parsedCore.createdBy ? { ...parsedCore.createdBy } : undefined,
            },
          ]
        : [],
      processedOperationKeys: new Set<string>(),
      idempotencyKey: parsedCore.idempotencyKey,
      version: 1,
      persistedVersion: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (props.lines) {
      for (const rawLine of props.lines) {
        order.addLine(rawLine, { now, flags, skipVersionIncrement: true });
      }
    }

    if (props.orderDiscounts) {
      for (const discount of props.orderDiscounts) {
        order.applyOrderDiscount(discount, { now, flags, skipVersionIncrement: true });
      }
    }

    if (props.surcharges) {
      for (const surcharge of props.surcharges) {
        order.addSurcharge(surcharge, { now, flags, skipVersionIncrement: true });
      }
    }

    if (parsedCore.initialStatus !== 'DRAFT') {
      order.transitionTo(parsedCore.initialStatus, {
        actor: parsedCore.createdBy,
        now,
        flags,
        skipVersionIncrement: true,
      });
    }

    return order;
  }

  public static fromSnapshot(raw: unknown): Order {
    const snap = parseWithSchema(OrderSnapshotSchema, raw, 'order snapshot');

    const lines: MutableOrderLine[] = snap.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxes: line.taxes.map((t) => ({ ...t })),
      discounts: line.discounts.map((d) => ({ ...d })),
      notes: line.notes,
      metadata: line.metadata ? { ...line.metadata } : undefined,
    }));

    return new Order({
      id: snap.id,
      documentKind: snap.documentKind,
      orderNumber: snap.orderNumber,
      channel: snap.channel,
      status: snap.status,
      currency: snap.currency,
      customerId: snap.customerId,
      quoteExpiresAt: snap.quoteExpiresAt ? new Date(snap.quoteExpiresAt) : undefined,
      sourceDocumentId: snap.sourceDocumentId,
      sourceDocumentIds: snap.sourceDocumentIds,
      externalImportRef: snap.externalImportRef,
      notes: snap.notes,
      metadata: snap.metadata ? { ...snap.metadata } : undefined,
      lines,
      orderDiscounts: snap.orderDiscounts.map((d) => ({ ...d })),
      surcharges: snap.surcharges.map((s) => ({ ...s })),
      fulfillment: snap.fulfillment ? { ...snap.fulfillment } : undefined,
      isParked: snap.isParked,
      parkedAt: snap.parkedAt ? new Date(snap.parkedAt) : undefined,
      parkReason: snap.parkReason,
      statusHistory: snap.statusHistory.map((h) => ({
        ...h,
        changedBy: h.changedBy ? { ...h.changedBy } : undefined,
      })),
      processedOperationKeys: new Set(snap.processedOperationKeys),
      idempotencyKey: snap.idempotencyKey,
      version: snap.version,
      persistedVersion: snap.version,
      createdAt: new Date(snap.createdAt),
      updatedAt: new Date(snap.updatedAt),
      confirmedAt: snap.confirmedAt ? new Date(snap.confirmedAt) : undefined,
      completedAt: snap.completedAt ? new Date(snap.completedAt) : undefined,
      cancelledAt: snap.cancelledAt ? new Date(snap.cancelledAt) : undefined,
      refundedAt: snap.refundedAt ? new Date(snap.refundedAt) : undefined,
    });
  }

  public get status(): OrderStatus {
    return this._status;
  }

  public get isParked(): boolean {
    return this._isParked;
  }

  public get parkedAt(): Date | undefined {
    return this._parkedAt ? new Date(this._parkedAt.getTime()) : undefined;
  }

  public get parkReason(): string | undefined {
    return this._parkReason;
  }

  public get fulfillment(): FulfillmentDetails | undefined {
    return this._fulfillment ? { ...this._fulfillment } : undefined;
  }

  public get surcharges(): ReadonlyArray<OrderSurcharge> {
    return this._surcharges.map((s) => ({ ...s }));
  }

  public get notes(): string | undefined {
    return this._notes;
  }

  public get metadata(): Readonly<OrderMetadata> | undefined {
    return this._metadata ? { ...this._metadata } : undefined;
  }

  public get lines(): ReadonlyArray<OrderLine> {
    return this._lines.map(cloneLine);
  }

  public get orderDiscounts(): ReadonlyArray<DiscountRule> {
    return this._orderDiscounts.map((d) => ({ ...d }));
  }

  public get statusHistory(): ReadonlyArray<OrderStatusChangeRecord> {
    return this._statusHistory.map((h) => ({
      ...h,
      changedBy: h.changedBy ? { ...h.changedBy } : undefined,
    }));
  }

  public get version(): number {
    return this._version;
  }

  public get persistedVersion(): number {
    return this._persistedVersion;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  public get confirmedAt(): Date | undefined {
    return this._confirmedAt ? new Date(this._confirmedAt.getTime()) : undefined;
  }

  public get completedAt(): Date | undefined {
    return this._completedAt ? new Date(this._completedAt.getTime()) : undefined;
  }

  public get cancelledAt(): Date | undefined {
    return this._cancelledAt ? new Date(this._cancelledAt.getTime()) : undefined;
  }

  public get refundedAt(): Date | undefined {
    return this._refundedAt ? new Date(this._refundedAt.getTime()) : undefined;
  }

  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  public hasProcessedOperation(key: string): boolean {
    return this._processedOperationKeys.has(key);
  }

  public recordProcessedOperation(key: string): void {
    this._processedOperationKeys.add(key);
  }

  private assertEditable(operation: string): void {
    if (!EDITABLE_STATUSES.has(this._status)) {
      throw new InvalidOrderStateError(this.id, this._status, operation);
    }
  }

  private validateLineConstraints(
    line: Pick<ParsedOrderLineInput, 'quantity' | 'taxes' | 'discounts'>,
    flags: OrderFeatureFlags
  ): void {
    if (!Number.isInteger(line.quantity)) {
      assertOrderFeatureEnabled(
        flags,
        'fractionalQuantities',
        `Fractional quantity (${line.quantity}) requires 'fractionalQuantities' feature.`
      );
    }

    if (line.taxes.length > 1) {
      assertOrderFeatureEnabled(
        flags,
        'multipleTaxesPerLine',
        `Line has ${line.taxes.length} taxes; multiple taxes per line are disabled.`
      );
    }

    if (line.taxes.some((t) => t.mode === 'INCLUSIVE')) {
      assertOrderFeatureEnabled(
        flags,
        'inclusiveTaxes',
        'Inclusive tax rules require the inclusiveTaxes feature.'
      );
    }

    if (line.discounts.length > 0) {
      assertOrderFeatureEnabled(
        flags,
        'lineDiscounts',
        'Line-level discounts require the lineDiscounts feature.'
      );
      for (const discount of line.discounts) {
        if (discount.couponCode) {
          assertOrderFeatureEnabled(flags, 'coupons', 'Coupon discounts require the coupons feature.');
          this.ensureCouponNotDuplicate(discount.couponCode);
        }
      }
    }
  }

  private ensureCouponNotDuplicate(couponCode: string): void {
    const normalized = couponCode.toUpperCase().trim();
    const existsOnOrder = this._orderDiscounts.some((d) => d.couponCode === normalized);
    const existsOnLines = this._lines.some((l) =>
      l.discounts.some((d) => d.couponCode === normalized)
    );
    if (existsOnOrder || existsOnLines) {
      throw new InvalidCouponError(normalized, 'Coupon has already been applied to this order.');
    }
  }

  private touch(now: Date, skipVersionIncrement = false): void {
    this._updatedAt = new Date(now.getTime());
    if (!skipVersionIncrement) {
      this._version += 1;
    }
  }

  public addLine(
    rawLine: OrderLineInput,
    options: {
      now?: Date;
      flags?: OrderFeatureFlags;
      idempotencyKey?: string;
      skipVersionIncrement?: boolean;
    } = {}
  ): OrderLine {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      const existing = this._lines.find((l) => l.lineId === rawLine.lineId);
      if (existing) return cloneLine(existing);
    }

    this.assertEditable('addLine');
    const parsed = parseWithSchema(OrderLineInputSchema, rawLine, 'order line');

    if (this._lines.some((l) => l.lineId === parsed.lineId)) {
      throw new DuplicateOrderLineError(this.id, parsed.lineId);
    }

    this.validateLineConstraints(parsed, flags);

    const newLine: MutableOrderLine = {
      lineId: parsed.lineId,
      productId: parsed.productId,
      sku: parsed.sku,
      name: parsed.name,
      quantity: parsed.quantity,
      unitPriceCents: parsed.unitPriceCents,
      taxes: parsed.taxes.map((t) => ({ ...t })),
      discounts: parsed.discounts.map((d) => ({ ...d })),
      notes: parsed.notes,
      metadata: parsed.metadata ? { ...parsed.metadata } : undefined,
    };

    this._lines.push(newLine);
    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date(), options.skipVersionIncrement);

    return cloneLine(newLine);
  }

  public updateLine(
    lineId: string,
    patch: {
      quantity?: number;
      unitPriceCents?: number;
      taxes?: TaxRule[];
      notes?: string | null;
      metadata?: OrderMetadata;
    },
    options: { now?: Date; flags?: OrderFeatureFlags; idempotencyKey?: string } = {}
  ): OrderLine {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      const existing = this._lines.find((l) => l.lineId === lineId);
      if (!existing) throw new OrderLineNotFoundError(this.id, lineId);
      return cloneLine(existing);
    }

    this.assertEditable('updateLine');
    const validatedPatch = parseWithSchema(UpdateLinePatchSchema, patch, 'order line patch');
    const line = this._lines.find((l) => l.lineId === lineId);
    if (!line) {
      throw new OrderLineNotFoundError(this.id, lineId);
    }

    const nextQuantity = validatedPatch.quantity ?? line.quantity;
    const nextTaxes = validatedPatch.taxes ?? line.taxes;
    const nextPrice = validatedPatch.unitPriceCents ?? line.unitPriceCents;

    this.validateLineConstraints(
      { quantity: nextQuantity, taxes: nextTaxes, discounts: [] },
      flags
    );

    line.quantity = nextQuantity;
    line.unitPriceCents = nextPrice;
    if (validatedPatch.taxes !== undefined) {
      line.taxes = validatedPatch.taxes.map((t) => ({ ...t }));
    }
    if (validatedPatch.notes === null) {
      line.notes = undefined;
    } else if (validatedPatch.notes !== undefined) {
      line.notes = validatedPatch.notes;
    }
    if (validatedPatch.metadata !== undefined) {
      line.metadata = { ...validatedPatch.metadata };
    }

    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date());

    return cloneLine(line);
  }

  public removeLine(
    lineId: string,
    options: { now?: Date; flags?: OrderFeatureFlags; idempotencyKey?: string } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      return;
    }

    this.assertEditable('removeLine');
    const index = this._lines.findIndex((l) => l.lineId === lineId);
    if (index === -1) {
      throw new OrderLineNotFoundError(this.id, lineId);
    }

    this._lines.splice(index, 1);
    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date());
  }

  public applyLineDiscount(
    lineId: string,
    discount: DiscountRule,
    options: {
      now?: Date;
      flags?: OrderFeatureFlags;
      idempotencyKey?: string;
      skipVersionIncrement?: boolean;
    } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      return;
    }

    this.assertEditable('applyLineDiscount');
    assertOrderFeatureEnabled(flags, 'lineDiscounts', 'Line-level discounts are disabled.');
    const validatedDiscount = parseWithSchema(DiscountRuleSchema, discount, 'line discount rule');
    if (validatedDiscount.couponCode) {
      assertOrderFeatureEnabled(flags, 'coupons', 'Coupon discounts are disabled.');
      this.ensureCouponNotDuplicate(validatedDiscount.couponCode);
    }

    const line = this._lines.find((l) => l.lineId === lineId);
    if (!line) {
      throw new OrderLineNotFoundError(this.id, lineId);
    }
    if (line.discounts.some((d) => d.id === validatedDiscount.id)) {
      throw new InvalidDiscountError(
        `Discount '${validatedDiscount.id}' already exists on line '${lineId}'.`
      );
    }

    line.discounts.push(validatedDiscount);

    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date(), options.skipVersionIncrement);
  }

  public removeLineDiscount(
    lineId: string,
    discountId: string,
    options: { now?: Date; flags?: OrderFeatureFlags; idempotencyKey?: string } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      return;
    }

    this.assertEditable('removeLineDiscount');
    const line = this._lines.find((l) => l.lineId === lineId);
    if (!line) {
      throw new OrderLineNotFoundError(this.id, lineId);
    }

    const idx = line.discounts.findIndex((d) => d.id === discountId);
    if (idx === -1) {
      throw new DiscountNotFoundError(discountId, `line '${lineId}'`);
    }

    line.discounts.splice(idx, 1);
    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date());
  }

  public applyOrderDiscount(
    discount: DiscountRule,
    options: {
      now?: Date;
      flags?: OrderFeatureFlags;
      idempotencyKey?: string;
      skipVersionIncrement?: boolean;
    } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      return;
    }

    this.assertEditable('applyOrderDiscount');
    assertOrderFeatureEnabled(flags, 'orderDiscounts', 'Order-level discounts are disabled.');
    const validatedDiscount = parseWithSchema(DiscountRuleSchema, discount, 'order discount rule');
    if (validatedDiscount.couponCode) {
      assertOrderFeatureEnabled(flags, 'coupons', 'Coupon discounts are disabled.');
      this.ensureCouponNotDuplicate(validatedDiscount.couponCode);
    }

    if (this._orderDiscounts.some((d) => d.id === validatedDiscount.id)) {
      throw new InvalidDiscountError(
        `Discount '${validatedDiscount.id}' already exists on order '${this.id}'.`
      );
    }

    this._orderDiscounts.push(validatedDiscount);

    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date(), options.skipVersionIncrement);
  }

  public removeOrderDiscount(
    discountId: string,
    options: { now?: Date; flags?: OrderFeatureFlags; idempotencyKey?: string } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      return;
    }

    this.assertEditable('removeOrderDiscount');
    const idx = this._orderDiscounts.findIndex((d) => d.id === discountId);
    if (idx === -1) {
      throw new DiscountNotFoundError(discountId, `order '${this.id}'`);
    }

    this._orderDiscounts.splice(idx, 1);
    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(options.now ?? new Date());
  }

  public transitionTo(
    targetStatus: OrderStatus,
    options: {
      actor?: ActorSummary;
      reason?: string;
      now?: Date;
      flags?: OrderFeatureFlags;
      idempotencyKey?: string;
      skipVersionIncrement?: boolean;
    } = {}
  ): OrderStatus {
    const flags = options.flags ?? resolveOrderFeatures();
    if (
      options.idempotencyKey &&
      isOrderFeatureEnabled(flags, 'offlineIdempotency') &&
      this.hasProcessedOperation(options.idempotencyKey)
    ) {
      return this._status;
    }

    if (this._isParked && targetStatus !== 'CANCELLED') {
      throw new InvalidOrderStateError(
        this.id,
        this._status,
        `transitionTo(${targetStatus}) while parked`
      );
    }

    const previousStatus = this._status;
    if (previousStatus === targetStatus) {
      throw new InvalidOrderStateError(this.id, previousStatus, `transitionTo(${targetStatus})`);
    }

    const useWorkflow = isOrderFeatureEnabled(flags, 'workflowStates');
    if (
      !useWorkflow &&
      (targetStatus === 'PENDING' || targetStatus === 'IN_PROGRESS' || targetStatus === 'READY')
    ) {
      assertOrderFeatureEnabled(
        flags,
        'workflowStates',
        `Target status '${targetStatus}' requires workflowStates.`
      );
    }

    const allowedTargets = useWorkflow
      ? WORKFLOW_TRANSITIONS[previousStatus]
      : BASIC_TRANSITIONS[previousStatus];

    if (!allowedTargets.includes(targetStatus)) {
      throw new InvalidOrderStateError(this.id, previousStatus, `transitionTo(${targetStatus})`);
    }

    if (targetStatus === 'EXPIRED' && this.documentKind !== 'QUOTE') {
      throw new InvalidOrderStateError(
        this.id,
        previousStatus,
        `transitionTo(EXPIRED) is only valid for QUOTE documents`
      );
    }

    if (targetStatus === 'REFUNDED') {
      assertOrderFeatureEnabled(flags, 'refunds', 'Order refunds are disabled in this profile.');
      if (!options.reason || !options.reason.trim()) {
        throw new InvalidOrderInputError('A reason is required to refund a completed order.');
      }
    }

    if (
      targetStatus !== 'CANCELLED' &&
      targetStatus !== 'DRAFT' &&
      targetStatus !== 'EXPIRED' &&
      this._lines.length === 0
    ) {
      throw new EmptyOrderError(this.id, `transitionTo(${targetStatus})`);
    }

    const now = options.now ? new Date(options.now.getTime()) : new Date();
    this._status = targetStatus;

    if (targetStatus === 'PENDING' && !this._confirmedAt) {
      this._confirmedAt = new Date(now.getTime());
    } else if (targetStatus === 'COMPLETED') {
      if (!this._confirmedAt) this._confirmedAt = new Date(now.getTime());
      this._completedAt = new Date(now.getTime());
    } else if (targetStatus === 'CANCELLED') {
      this._cancelledAt = new Date(now.getTime());
      this._isParked = false;
      this._parkedAt = undefined;
      this._parkReason = undefined;
    } else if (targetStatus === 'REFUNDED') {
      this._refundedAt = new Date(now.getTime());
    }

    if (isOrderFeatureEnabled(flags, 'auditTrail')) {
      this._statusHistory.push({
        from: previousStatus,
        to: targetStatus,
        changedAt: now.toISOString(),
        changedBy: options.actor ? { ...options.actor } : undefined,
        reason: options.reason?.trim(),
      });
    }

    if (options.idempotencyKey && isOrderFeatureEnabled(flags, 'offlineIdempotency')) {
      this.recordProcessedOperation(options.idempotencyKey);
    }
    this.touch(now, options.skipVersionIncrement);

    return previousStatus;
  }

  public park(
    reason?: string,
    options: { now?: Date; flags?: OrderFeatureFlags; skipVersionIncrement?: boolean } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    assertOrderFeatureEnabled(flags, 'parkedOrders');
    if (
      this._status === 'COMPLETED' ||
      this._status === 'CANCELLED' ||
      this._status === 'REFUNDED' ||
      this._status === 'EXPIRED'
    ) {
      throw new InvalidOrderStateError(this.id, this._status, 'park');
    }
    const now = options.now ? new Date(options.now.getTime()) : new Date();
    this._isParked = true;
    this._parkedAt = new Date(now.getTime());
    this._parkReason = reason?.trim() || undefined;
    this.touch(now, options.skipVersionIncrement);
  }

  public resume(
    options: { now?: Date; flags?: OrderFeatureFlags; skipVersionIncrement?: boolean } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    assertOrderFeatureEnabled(flags, 'parkedOrders');
    if (!this._isParked) return;
    const now = options.now ?? new Date();
    this._isParked = false;
    this._parkedAt = undefined;
    this._parkReason = undefined;
    this.touch(now, options.skipVersionIncrement);
  }

  public setFulfillment(
    rawDetails: FulfillmentDetails,
    options: { now?: Date; flags?: OrderFeatureFlags; skipVersionIncrement?: boolean } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    assertOrderFeatureEnabled(flags, 'fulfillmentDetails');
    if (this._status === 'COMPLETED' || this._status === 'CANCELLED' || this._status === 'REFUNDED') {
      throw new InvalidOrderStateError(this.id, this._status, 'setFulfillment');
    }
    this._fulfillment = parseWithSchema(FulfillmentDetailsSchema, rawDetails, 'fulfillment details');
    this.touch(options.now ?? new Date(), options.skipVersionIncrement);
  }

  public addSurcharge(
    rawSurcharge: OrderSurcharge,
    options: { now?: Date; flags?: OrderFeatureFlags; skipVersionIncrement?: boolean } = {}
  ): void {
    const flags = options.flags ?? resolveOrderFeatures();
    assertOrderFeatureEnabled(flags, 'surchargesAndFees');
    this.assertEditable('addSurcharge');
    const surcharge = parseWithSchema(OrderSurchargeSchema, rawSurcharge, 'order surcharge');
    const idx = this._surcharges.findIndex((s) => s.id === surcharge.id);
    if (idx >= 0) {
      this._surcharges[idx] = surcharge;
    } else {
      this._surcharges.push(surcharge);
    }
    this.touch(options.now ?? new Date(), options.skipVersionIncrement);
  }

  public removeSurcharge(
    surchargeId: string,
    options: { now?: Date; flags?: OrderFeatureFlags; skipVersionIncrement?: boolean } = {}
  ): boolean {
    const flags = options.flags ?? resolveOrderFeatures();
    assertOrderFeatureEnabled(flags, 'surchargesAndFees');
    this.assertEditable('removeSurcharge');
    const before = this._surcharges.length;
    this._surcharges = this._surcharges.filter((s) => s.id !== surchargeId);
    if (this._surcharges.length === before) return false;
    this.touch(options.now ?? new Date(), options.skipVersionIncrement);
    return true;
  }

  public calculateSummary(): OrderPricingSummary {
    return OrderPricingService.calculate({
      currency: this.currency,
      lines: this._lines,
      orderDiscounts: this._orderDiscounts,
      surcharges: this._surcharges,
    });
  }

  public toSnapshot(): OrderSnapshot {
    return {
      schemaVersion: ORDER_SCHEMA_VERSION,
      id: this.id,
      documentKind: this.documentKind,
      orderNumber: this.orderNumber,
      channel: this.channel,
      status: this._status,
      currency: this.currency,
      customerId: this.customerId,
      quoteExpiresAt: this.quoteExpiresAt?.toISOString(),
      sourceDocumentId: this.sourceDocumentId,
      sourceDocumentIds: [...this.sourceDocumentIds],
      externalImportRef: this.externalImportRef,
      notes: this._notes,
      metadata: this._metadata ? { ...this._metadata } : undefined,
      lines: this._lines.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxes: line.taxes.map((t) => ({ ...t })),
        discounts: line.discounts.map((d) => ({ ...d })),
        notes: line.notes,
        metadata: line.metadata ? { ...line.metadata } : undefined,
      })),
      orderDiscounts: this._orderDiscounts.map((d) => ({ ...d })),
      surcharges: this._surcharges.map((s) => ({ ...s })),
      fulfillment: this._fulfillment ? { ...this._fulfillment } : undefined,
      isParked: this._isParked,
      parkedAt: this._parkedAt?.toISOString(),
      parkReason: this._parkReason,
      statusHistory: this._statusHistory.map((h) => ({
        ...h,
        changedBy: h.changedBy ? { ...h.changedBy } : undefined,
      })),
      processedOperationKeys: Array.from(this._processedOperationKeys),
      idempotencyKey: this.idempotencyKey,
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      confirmedAt: this._confirmedAt?.toISOString(),
      completedAt: this._completedAt?.toISOString(),
      cancelledAt: this._cancelledAt?.toISOString(),
      refundedAt: this._refundedAt?.toISOString(),
    };
  }
}
