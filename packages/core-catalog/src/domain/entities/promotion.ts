import { divideHalfEven } from '@modulos/core-shared';
import {
  CATALOG_SCHEMA_VERSION,
  PromotionSnapshot,
  PromotionSnapshotSchema,
  PromotionType,
  SalesChannel,
  parseWithCatalogSchema,
} from '../../schemas/catalog.schemas.js';
import { InvalidCatalogInputError } from '../errors/catalog-errors.js';

export interface CreatePromotionProps {
  id: string;
  code: string;
  name: string;
  type: PromotionType;
  value?: number;
  currency?: string;
  buyQuantity?: number;
  getQuantity?: number;
  targetItemIds?: string[];
  targetCategoryIds?: string[];
  channels?: SalesChannel[];
  customerSegments?: string[];
  minQuantity?: number;
  priority?: number;
  stackable?: boolean;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;
  now?: Date;
}

export class PromotionRule {
  public readonly schemaVersion = CATALOG_SCHEMA_VERSION;
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly type: PromotionType;
  public readonly value: number;
  public readonly currency?: string;
  public readonly buyQuantity?: number;
  public readonly getQuantity?: number;
  public readonly targetItemIds: ReadonlyArray<string>;
  public readonly targetCategoryIds: ReadonlyArray<string>;
  public readonly channels: ReadonlyArray<SalesChannel>;
  public readonly customerSegments: ReadonlyArray<string>;
  public readonly minQuantity: number;
  public readonly priority: number;
  public readonly stackable: boolean;
  private _isActive: boolean;
  public readonly validFrom?: string;
  public readonly validTo?: string;
  private _version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;

  private constructor(snap: PromotionSnapshot) {
    this.id = snap.id;
    this.code = snap.code;
    this.name = snap.name;
    this.type = snap.type;
    this.value = snap.value;
    this.currency = snap.currency;
    this.buyQuantity = snap.buyQuantity;
    this.getQuantity = snap.getQuantity;
    this.targetItemIds = [...snap.targetItemIds];
    this.targetCategoryIds = [...snap.targetCategoryIds];
    this.channels = [...snap.channels];
    this.customerSegments = [...snap.customerSegments];
    this.minQuantity = snap.minQuantity;
    this.priority = snap.priority;
    this.stackable = snap.stackable;
    this._isActive = snap.isActive;
    this.validFrom = snap.validFrom;
    this.validTo = snap.validTo;
    this._version = snap.version;
    this._persistedVersion = snap.version;
    this.createdAt = snap.createdAt;
    this._updatedAt = snap.updatedAt;
  }

  public static create(props: CreatePromotionProps): PromotionRule {
    const nowIso = (props.now ?? new Date()).toISOString();
    const parsed = parseWithCatalogSchema(
      PromotionSnapshotSchema,
      {
        schemaVersion: CATALOG_SCHEMA_VERSION,
        id: props.id,
        code: props.code,
        name: props.name,
        type: props.type,
        value: props.value ?? 0,
        currency: props.currency,
        buyQuantity: props.buyQuantity,
        getQuantity: props.getQuantity,
        targetItemIds: props.targetItemIds ?? [],
        targetCategoryIds: props.targetCategoryIds ?? [],
        channels: props.channels ?? ['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE'],
        customerSegments: props.customerSegments ?? [],
        minQuantity: props.minQuantity ?? 1,
        priority: props.priority ?? 0,
        stackable: props.stackable ?? false,
        isActive: props.isActive ?? true,
        validFrom: props.validFrom?.toISOString(),
        validTo: props.validTo?.toISOString(),
        version: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'promotion creation payload'
    );

    return new PromotionRule(parsed);
  }

  public static fromSnapshot(raw: unknown): PromotionRule {
    const parsed = parseWithCatalogSchema(PromotionSnapshotSchema, raw, 'promotion snapshot');
    return new PromotionRule(parsed);
  }

  get isActive(): boolean { return this._isActive; }
  get version(): number { return this._version; }
  get persistedVersion(): number { return this._persistedVersion; }
  get updatedAt(): string { return this._updatedAt; }

  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  public matches(params: {
    itemId: string;
    categoryIds: ReadonlyArray<string>;
    quantity: number;
    currency?: string;
    channel?: SalesChannel;
    customerSegment?: string;
    now?: Date;
  }): boolean {
    if (!this._isActive) return false;
    if (
      this.type === 'FIXED_AMOUNT' &&
      this.currency &&
      params.currency &&
      this.currency !== params.currency.toUpperCase().trim()
    ) {
      return false;
    }
    const nowMs = (params.now ?? new Date()).getTime();
    if (this.validFrom && nowMs < new Date(this.validFrom).getTime()) return false;
    if (this.validTo && nowMs > new Date(this.validTo).getTime()) return false;
    if (params.quantity < this.minQuantity) return false;
    if (params.channel && !this.channels.includes(params.channel)) return false;
    if (
      this.customerSegments.length > 0 &&
      (!params.customerSegment || !this.customerSegments.includes(params.customerSegment))
    ) {
      return false;
    }

    const hasTargetFilter = this.targetItemIds.length > 0 || this.targetCategoryIds.length > 0;
    if (!hasTargetFilter) return true;

    if (this.targetItemIds.includes(params.itemId)) return true;
    return params.categoryIds.some((c) => this.targetCategoryIds.includes(c));
  }

  public calculateDiscountCents(params: {
    unitPriceCents: number;
    quantity: number;
    remainingGrossCents: number;
  }): number {
    if (params.remainingGrossCents <= 0) return 0;

    if (this.type === 'PERCENTAGE') {
      const scaledRate = BigInt(Math.round(this.value * 10_000));
      const disc = divideHalfEven(BigInt(params.remainingGrossCents) * scaledRate, 1_000_000n);
      return Math.min(params.remainingGrossCents, disc);
    }

    if (this.type === 'FIXED_AMOUNT') {
      return Math.min(params.remainingGrossCents, this.value);
    }

    // BUY_X_GET_Y (e.g., buy 2 get 1 free => group size 3, 1 unit free per full group of 3)
    const buy = this.buyQuantity ?? 1;
    const get = this.getQuantity ?? 1;
    const groupSize = buy + get;
    const wholeQty = Math.floor(params.quantity);
    const fullGroups = Math.floor(wholeQty / groupSize);
    const freeUnits = fullGroups * get;
    const discBig = BigInt(freeUnits) * BigInt(params.unitPriceCents);
    const remainingBig = BigInt(params.remainingGrossCents);
    const bounded = discBig > remainingBig ? remainingBig : discBig;
    const result = Number(bounded);
    if (!Number.isSafeInteger(result)) {
      throw new InvalidCatalogInputError('Calculated BUY_X_GET_Y discount exceeds safe integer range.');
    }
    return result;
  }

  public toSnapshot(): PromotionSnapshot {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      code: this.code,
      name: this.name,
      type: this.type,
      value: this.value,
      currency: this.currency,
      buyQuantity: this.buyQuantity,
      getQuantity: this.getQuantity,
      targetItemIds: [...this.targetItemIds],
      targetCategoryIds: [...this.targetCategoryIds],
      channels: [...this.channels],
      customerSegments: [...this.customerSegments],
      minQuantity: this.minQuantity,
      priority: this.priority,
      stackable: this.stackable,
      isActive: this._isActive,
      validFrom: this.validFrom,
      validTo: this.validTo,
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
