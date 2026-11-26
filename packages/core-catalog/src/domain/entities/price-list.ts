import {
  CATALOG_SCHEMA_VERSION,
  PriceListEntry,
  PriceListEntrySchema,
  PriceListSnapshot,
  PriceListSnapshotSchema,
  SalesChannel,
  parseWithCatalogSchema,
} from '../../schemas/catalog.schemas.js';

export interface CreatePriceListProps {
  id: string;
  code: string;
  name: string;
  currency?: string;
  priority?: number;
  channels?: SalesChannel[];
  customerSegments?: string[];
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;
  entries?: PriceListEntry[];
  now?: Date;
}

export class PriceList {
  public readonly schemaVersion = CATALOG_SCHEMA_VERSION;
  public readonly id: string;
  public readonly code: string;
  private _name: string;
  public readonly currency: string;
  private _priority: number;
  private _channels: SalesChannel[];
  private _customerSegments: string[];
  private _isActive: boolean;
  private _validFrom?: string;
  private _validTo?: string;
  private _entries: PriceListEntry[];
  private _version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;

  private constructor(snap: PriceListSnapshot) {
    this.id = snap.id;
    this.code = snap.code;
    this._name = snap.name;
    this.currency = snap.currency;
    this._priority = snap.priority;
    this._channels = [...snap.channels];
    this._customerSegments = [...snap.customerSegments];
    this._isActive = snap.isActive;
    this._validFrom = snap.validFrom;
    this._validTo = snap.validTo;
    this._entries = snap.entries.map((e) => ({
      ...e,
      volumeTiers: e.volumeTiers.map((t) => ({ ...t })),
    }));
    this._version = snap.version;
    this._persistedVersion = snap.version;
    this.createdAt = snap.createdAt;
    this._updatedAt = snap.updatedAt;
  }

  public static create(props: CreatePriceListProps): PriceList {
    const nowIso = (props.now ?? new Date()).toISOString();
    const parsed = parseWithCatalogSchema(
      PriceListSnapshotSchema,
      {
        schemaVersion: CATALOG_SCHEMA_VERSION,
        id: props.id,
        code: props.code,
        name: props.name,
        currency: props.currency ?? 'MXN',
        priority: props.priority ?? 0,
        channels: props.channels ?? ['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE'],
        customerSegments: props.customerSegments ?? [],
        isActive: props.isActive ?? true,
        validFrom: props.validFrom?.toISOString(),
        validTo: props.validTo?.toISOString(),
        entries: props.entries ?? [],
        version: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'price list creation payload'
    );
    return new PriceList(parsed);
  }

  public static fromSnapshot(raw: unknown): PriceList {
    const parsed = parseWithCatalogSchema(PriceListSnapshotSchema, raw, 'price list snapshot');
    return new PriceList(parsed);
  }

  get name(): string { return this._name; }
  get priority(): number { return this._priority; }
  get channels(): ReadonlyArray<SalesChannel> { return [...this._channels]; }
  get customerSegments(): ReadonlyArray<string> { return [...this._customerSegments]; }
  get isActive(): boolean { return this._isActive; }
  get entries(): ReadonlyArray<PriceListEntry> {
    return this._entries.map((e) => ({
      ...e,
      volumeTiers: e.volumeTiers.map((t) => ({ ...t })),
    }));
  }
  get version(): number { return this._version; }
  get persistedVersion(): number { return this._persistedVersion; }
  get updatedAt(): string { return this._updatedAt; }

  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  public isApplicable(params: {
    channel?: SalesChannel;
    customerSegment?: string;
    now?: Date;
  }): boolean {
    if (!this._isActive) return false;
    const nowMs = (params.now ?? new Date()).getTime();
    if (this._validFrom && nowMs < new Date(this._validFrom).getTime()) return false;
    if (this._validTo && nowMs > new Date(this._validTo).getTime()) return false;
    if (params.channel && !this._channels.includes(params.channel)) return false;
    if (
      this._customerSegments.length > 0 &&
      (!params.customerSegment || !this._customerSegments.includes(params.customerSegment))
    ) {
      return false;
    }
    return true;
  }

  public upsertEntry(rawEntry: unknown, now = new Date()): void {
    const entry = parseWithCatalogSchema(PriceListEntrySchema, rawEntry, 'price list entry');
    const idx = this._entries.findIndex(
      (e) => e.itemId === entry.itemId && (e.variantId ?? undefined) === (entry.variantId ?? undefined)
    );
    if (idx >= 0) {
      this._entries[idx] = entry;
    } else {
      this._entries.push(entry);
    }
    this._version += 1;
    this._updatedAt = now.toISOString();
  }

  public resolveUnitPriceCents(params: {
    itemId: string;
    variantId?: string;
    quantity?: number;
    enableVolumeTiers?: boolean;
  }): number | undefined {
    const entry =
      (params.variantId
        ? this._entries.find((e) => e.itemId === params.itemId && e.variantId === params.variantId)
        : undefined) ?? this._entries.find((e) => e.itemId === params.itemId && !e.variantId);

    if (!entry) return undefined;

    const qty = params.quantity ?? 1;
    if ((params.enableVolumeTiers ?? true) && entry.volumeTiers.length > 0) {
      const sortedTiers = [...entry.volumeTiers].sort((a, b) => b.minQuantity - a.minQuantity);
      const matched = sortedTiers.find((t) => qty >= t.minQuantity);
      if (matched) {
        return matched.unitPriceCents;
      }
    }
    return entry.unitPriceCents;
  }

  public toSnapshot(): PriceListSnapshot {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      code: this.code,
      name: this._name,
      currency: this.currency,
      priority: this._priority,
      channels: [...this._channels],
      customerSegments: [...this._customerSegments],
      isActive: this._isActive,
      validFrom: this._validFrom,
      validTo: this._validTo,
      entries: this._entries.map((e) => ({
        ...e,
        volumeTiers: e.volumeTiers.map((t) => ({ ...t })),
      })),
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
