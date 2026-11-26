import {
  BundleComponent,
  CATALOG_SCHEMA_VERSION,
  CatalogItemSnapshot,
  CatalogItemSnapshotSchema,
  CatalogItemStatus,
  CatalogItemType,
  CatalogMetadata,
  CatalogVariant,
  CatalogVariantSchema,
  ModifierGroup,
  ModifierGroupSchema,
  SalesChannel,
  TaxHint,
  parseWithCatalogSchema,
} from '../../schemas/catalog.schemas.js';
import {
  InvalidCatalogInputError,
  InvalidModifierSelectionError,
  VariantNotFoundError,
} from '../errors/catalog-errors.js';
import {
  CatalogFeatureProfile,
  isCatalogFeatureEnabled,
  resolveCatalogFeatures,
} from '../services/catalog-features.js';

export interface CreateCatalogItemProps {
  id: string;
  sku: string;
  name: string;
  description?: string;
  type?: CatalogItemType;
  status?: CatalogItemStatus;
  categoryIds?: string[];
  barcodes?: string[];
  currency?: string;
  basePriceCents: number;
  unitLabel?: string;
  durationMinutes?: number;
  taxHint?: TaxHint;
  variants?: CatalogVariant[];
  modifierGroups?: ModifierGroup[];
  bundleComponents?: BundleComponent[];
  channels?: SalesChannel[];
  tags?: string[];
  metadata?: CatalogMetadata;
  now?: Date;
  featureProfile?: CatalogFeatureProfile;
}

export interface SelectedModifierInput {
  groupId: string;
  optionId: string;
  quantity?: number;
}

export interface ValidatedModifierResult {
  readonly totalDeltaCents: number;
  readonly selectedDetails: ReadonlyArray<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    quantity: number;
    unitDeltaCents: number;
    totalDeltaCents: number;
  }>;
}

export class CatalogItem {
  public readonly schemaVersion = CATALOG_SCHEMA_VERSION;
  public readonly id: string;
  private _sku: string;
  private _name: string;
  private _description?: string;
  private _type: CatalogItemType;
  private _status: CatalogItemStatus;
  private _categoryIds: string[];
  private _barcodes: string[];
  public readonly currency: string;
  private _basePriceCents: number;
  private _unitLabel: string;
  private _durationMinutes?: number;
  private _taxHint?: TaxHint;
  private _variants: CatalogVariant[];
  private _modifierGroups: ModifierGroup[];
  private _bundleComponents: BundleComponent[];
  private _channels: SalesChannel[];
  private _tags: string[];
  private _metadata?: CatalogMetadata;
  private _version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;

  private constructor(snap: CatalogItemSnapshot) {
    this.id = snap.id;
    this._sku = snap.sku;
    this._name = snap.name;
    this._description = snap.description;
    this._type = snap.type;
    this._status = snap.status;
    this._categoryIds = [...snap.categoryIds];
    this._barcodes = [...snap.barcodes];
    this.currency = snap.currency;
    this._basePriceCents = snap.basePriceCents;
    this._unitLabel = snap.unitLabel;
    this._durationMinutes = snap.durationMinutes;
    this._taxHint = snap.taxHint ? { ...snap.taxHint } : undefined;
    this._variants = snap.variants.map((v) => ({
      ...v,
      barcodes: [...v.barcodes],
      attributes: { ...v.attributes },
    }));
    this._modifierGroups = snap.modifierGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    }));
    this._bundleComponents = snap.bundleComponents.map((b) => ({ ...b }));
    this._channels = [...snap.channels];
    this._tags = [...snap.tags];
    this._metadata = snap.metadata ? { ...snap.metadata } : undefined;
    this._version = snap.version;
    this._persistedVersion = snap.version;
    this.createdAt = snap.createdAt;
    this._updatedAt = snap.updatedAt;
  }

  public static create(props: CreateCatalogItemProps): CatalogItem {
    const flags = resolveCatalogFeatures(props.featureProfile);
    const nowIso = (props.now ?? new Date()).toISOString();

    const parsed = parseWithCatalogSchema(
      CatalogItemSnapshotSchema,
      {
        schemaVersion: CATALOG_SCHEMA_VERSION,
        id: props.id,
        sku: props.sku,
        name: props.name,
        description: props.description,
        type: props.type ?? 'PHYSICAL',
        status: props.status ?? 'ACTIVE',
        categoryIds: isCatalogFeatureEnabled(flags, 'categories') ? (props.categoryIds ?? []) : [],
        barcodes: isCatalogFeatureEnabled(flags, 'multiBarcodeLookup')
          ? (props.barcodes ?? [])
          : (props.barcodes ?? []).slice(0, 1),
        currency: props.currency ?? 'MXN',
        basePriceCents: props.basePriceCents,
        unitLabel: props.unitLabel ?? 'UNIT',
        durationMinutes: props.durationMinutes,
        taxHint: isCatalogFeatureEnabled(flags, 'taxProfileHints') ? props.taxHint : undefined,
        variants: isCatalogFeatureEnabled(flags, 'variants') ? (props.variants ?? []) : [],
        modifierGroups: isCatalogFeatureEnabled(flags, 'modifiersAndAddons')
          ? (props.modifierGroups ?? [])
          : [],
        bundleComponents: isCatalogFeatureEnabled(flags, 'bundlesAndKits')
          ? (props.bundleComponents ?? [])
          : [],
        channels: isCatalogFeatureEnabled(flags, 'multiChannelVisibility')
          ? (props.channels ?? ['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE'])
          : ['POS'],
        tags: props.tags ?? [],
        metadata: props.metadata,
        version: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'catalog item creation payload'
    );
    return new CatalogItem(parsed);
  }

  public static fromSnapshot(raw: unknown): CatalogItem {
    const parsed = parseWithCatalogSchema(CatalogItemSnapshotSchema, raw, 'catalog item snapshot');
    return new CatalogItem(parsed);
  }

  get sku(): string { return this._sku; }
  get name(): string { return this._name; }
  get description(): string | undefined { return this._description; }
  get type(): CatalogItemType { return this._type; }
  get status(): CatalogItemStatus { return this._status; }
  get categoryIds(): ReadonlyArray<string> { return [...this._categoryIds]; }
  get barcodes(): ReadonlyArray<string> { return [...this._barcodes]; }
  get basePriceCents(): number { return this._basePriceCents; }
  get unitLabel(): string { return this._unitLabel; }
  get durationMinutes(): number | undefined { return this._durationMinutes; }
  get taxHint(): TaxHint | undefined { return this._taxHint ? { ...this._taxHint } : undefined; }
  get variants(): ReadonlyArray<CatalogVariant> {
    return this._variants.map((v) => ({
      ...v,
      barcodes: [...v.barcodes],
      attributes: { ...v.attributes },
    }));
  }
  get modifierGroups(): ReadonlyArray<ModifierGroup> {
    return this._modifierGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    }));
  }
  get bundleComponents(): ReadonlyArray<BundleComponent> {
    return this._bundleComponents.map((b) => ({ ...b }));
  }
  get channels(): ReadonlyArray<SalesChannel> { return [...this._channels]; }
  get tags(): ReadonlyArray<string> { return [...this._tags]; }
  get metadata(): CatalogMetadata | undefined {
    return this._metadata ? { ...this._metadata } : undefined;
  }
  get version(): number { return this._version; }
  get persistedVersion(): number { return this._persistedVersion; }
  get updatedAt(): string { return this._updatedAt; }

  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  public isAvailableInChannel(channel: SalesChannel): boolean {
    return this._status === 'ACTIVE' && this._channels.includes(channel);
  }

  public getAllBarcodes(): string[] {
    const set = new Set<string>(this._barcodes);
    for (const v of this._variants) {
      for (const b of v.barcodes) set.add(b);
    }
    return Array.from(set);
  }

  public findVariant(variantId: string): CatalogVariant | undefined {
    return this._variants.find((v) => v.id === variantId);
  }

  public findVariantByCode(code: string): CatalogVariant | undefined {
    const normalized = code.trim().toLowerCase();
    return this._variants.find(
      (v) =>
        v.sku.toLowerCase() === normalized ||
        v.barcodes.some((b) => b.toLowerCase() === normalized)
    );
  }

  public getEffectiveBasePriceCents(variantId?: string): number {
    if (!variantId) return this._basePriceCents;
    const variant = this.findVariant(variantId);
    if (!variant) {
      throw new VariantNotFoundError(this.id, variantId);
    }
    return variant.basePriceCents;
  }

  public upsertVariant(rawVariant: unknown, now = new Date()): void {
    const variant = parseWithCatalogSchema(CatalogVariantSchema, rawVariant, 'catalog variant');
    if (
      variant.sku.toLowerCase() === this._sku.toLowerCase() ||
      this._variants.some(
        (v) => v.id !== variant.id && v.sku.toLowerCase() === variant.sku.toLowerCase()
      )
    ) {
      throw new InvalidCatalogInputError(`Duplicate SKU '${variant.sku}' within catalog item '${this.id}'.`);
    }
    const existingBarcodes = new Set([
      ...this._barcodes.map((b) => b.toLowerCase()),
      ...this._variants
        .filter((v) => v.id !== variant.id)
        .flatMap((v) => v.barcodes.map((b) => b.toLowerCase())),
    ]);
    for (const bc of variant.barcodes) {
      if (existingBarcodes.has(bc.toLowerCase())) {
        throw new InvalidCatalogInputError(`Duplicate barcode '${bc}' within catalog item '${this.id}'.`);
      }
      existingBarcodes.add(bc.toLowerCase());
    }

    const idx = this._variants.findIndex((v) => v.id === variant.id);
    if (idx >= 0) {
      this._variants[idx] = variant;
    } else {
      this._variants.push(variant);
    }
    this._version += 1;
    this._updatedAt = now.toISOString();
  }

  public upsertModifierGroup(rawGroup: unknown, now = new Date()): void {
    const group = parseWithCatalogSchema(ModifierGroupSchema, rawGroup, 'modifier group');
    if (group.minSelections > group.maxSelections) {
      throw new InvalidCatalogInputError(
        `Modifier group '${group.id}' minSelections cannot exceed maxSelections.`
      );
    }
    const idx = this._modifierGroups.findIndex((g) => g.id === group.id);
    if (idx >= 0) {
      this._modifierGroups[idx] = group;
    } else {
      this._modifierGroups.push(group);
    }
    this._version += 1;
    this._updatedAt = now.toISOString();
  }

  public validateModifierSelection(
    selections: ReadonlyArray<SelectedModifierInput> = []
  ): ValidatedModifierResult {
    const selectionsByGroup = new Map<string, SelectedModifierInput[]>();
    for (const sel of selections) {
      const list = selectionsByGroup.get(sel.groupId) ?? [];
      list.push(sel);
      selectionsByGroup.set(sel.groupId, list);
    }

    for (const groupId of selectionsByGroup.keys()) {
      if (!this._modifierGroups.some((g) => g.id === groupId)) {
        throw new InvalidModifierSelectionError(groupId, 'Modifier group does not belong to this item.');
      }
    }

    let totalDeltaCents = 0;
    const selectedDetails: Array<{
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      quantity: number;
      unitDeltaCents: number;
      totalDeltaCents: number;
    }> = [];

    for (const group of this._modifierGroups) {
      const chosen = selectionsByGroup.get(group.id) ?? [];
      let totalSelectedCount = 0;

      for (const item of chosen) {
        const option = group.options.find((o) => o.id === item.optionId);
        if (!option || !option.isActive) {
          throw new InvalidModifierSelectionError(
            group.id,
            `Option '${item.optionId}' is not available.`
          );
        }
        const qty = item.quantity ?? 1;
        if (!Number.isInteger(qty) || qty < 1 || qty > option.maxQuantity) {
          throw new InvalidModifierSelectionError(
            group.id,
            `Quantity (${qty}) for option '${option.id}' must be between 1 and ${option.maxQuantity}.`
          );
        }
        totalSelectedCount += qty;
        const delta = option.priceDeltaCents * qty;
        totalDeltaCents += delta;
        selectedDetails.push({
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          quantity: qty,
          unitDeltaCents: option.priceDeltaCents,
          totalDeltaCents: delta,
        });
      }

      if (totalSelectedCount < group.minSelections) {
        throw new InvalidModifierSelectionError(
          group.id,
          `Group '${group.name}' requires at least ${group.minSelections} selection(s).`
        );
      }
      if (totalSelectedCount > group.maxSelections) {
        throw new InvalidModifierSelectionError(
          group.id,
          `Group '${group.name}' allows at most ${group.maxSelections} selection(s).`
        );
      }
    }

    return { totalDeltaCents, selectedDetails };
  }

  public update(
    patch: {
      name?: string;
      description?: string;
      status?: CatalogItemStatus;
      categoryIds?: string[];
      barcodes?: string[];
      basePriceCents?: number;
      unitLabel?: string;
      taxHint?: TaxHint;
      channels?: SalesChannel[];
      tags?: string[];
      metadata?: CatalogMetadata;
    },
    now = new Date()
  ): void {
    const partial = parseWithCatalogSchema(
      CatalogItemSnapshotSchema.pick({
        name: true,
        description: true,
        status: true,
        categoryIds: true,
        barcodes: true,
        basePriceCents: true,
        unitLabel: true,
        taxHint: true,
        channels: true,
        tags: true,
        metadata: true,
      }).partial(),
      patch,
      'catalog item update patch'
    );

    if (partial.name !== undefined) this._name = partial.name;
    if (partial.description !== undefined) this._description = partial.description;
    if (partial.status !== undefined) this._status = partial.status;
    if (partial.categoryIds !== undefined) this._categoryIds = [...partial.categoryIds];
    if (partial.barcodes !== undefined) this._barcodes = [...partial.barcodes];
    if (partial.basePriceCents !== undefined) this._basePriceCents = partial.basePriceCents;
    if (partial.unitLabel !== undefined) this._unitLabel = partial.unitLabel;
    if (partial.taxHint !== undefined) this._taxHint = { ...partial.taxHint };
    if (partial.channels !== undefined) this._channels = [...partial.channels];
    if (partial.tags !== undefined) this._tags = [...partial.tags];
    if (partial.metadata !== undefined) this._metadata = { ...partial.metadata };

    this._version += 1;
    this._updatedAt = now.toISOString();
  }

  public toSnapshot(): CatalogItemSnapshot {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      sku: this._sku,
      name: this._name,
      description: this._description,
      type: this._type,
      status: this._status,
      categoryIds: [...this._categoryIds],
      barcodes: [...this._barcodes],
      currency: this.currency,
      basePriceCents: this._basePriceCents,
      unitLabel: this._unitLabel,
      durationMinutes: this._durationMinutes,
      taxHint: this._taxHint ? { ...this._taxHint } : undefined,
      variants: this.variants as CatalogVariant[],
      modifierGroups: this.modifierGroups as ModifierGroup[],
      bundleComponents: this.bundleComponents as BundleComponent[],
      channels: [...this._channels],
      tags: [...this._tags],
      metadata: this._metadata ? { ...this._metadata } : undefined,
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
