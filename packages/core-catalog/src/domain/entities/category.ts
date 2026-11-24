import {
  CATALOG_SCHEMA_VERSION,
  CategorySnapshot,
  CategorySnapshotSchema,
  SalesChannel,
  parseWithCatalogSchema,
} from '../../schemas/catalog.schemas.js';
import { CyclicCategoryError } from '../errors/catalog-errors.js';

export interface CreateCategoryProps {
  id: string;
  slug: string;
  name: string;
  description?: string;
  parentId?: string;
  sortOrder?: number;
  isActive?: boolean;
  channels?: SalesChannel[];
  now?: Date;
}

export function assertNoCategoryCycle(
  categoryId: string,
  parentId: string | undefined,
  categoriesById: ReadonlyMap<string, Category>
): void {
  if (!parentId) return;
  const visited = new Set<string>([categoryId]);
  let current: string | undefined = parentId;

  while (current) {
    if (visited.has(current)) {
      throw new CyclicCategoryError(categoryId, current);
    }
    visited.add(current);
    current = categoriesById.get(current)?.parentId;
  }
}

export class Category {
  public readonly schemaVersion = CATALOG_SCHEMA_VERSION;
  public readonly id: string;
  private _slug: string;
  private _name: string;
  private _description?: string;
  private _parentId?: string;
  private _sortOrder: number;
  private _isActive: boolean;
  private _channels: SalesChannel[];
  private _version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;

  private constructor(snap: CategorySnapshot) {
    this.id = snap.id;
    this._slug = snap.slug;
    this._name = snap.name;
    this._description = snap.description;
    this._parentId = snap.parentId;
    this._sortOrder = snap.sortOrder;
    this._isActive = snap.isActive;
    this._channels = [...snap.channels];
    this._version = snap.version;
    this._persistedVersion = snap.version;
    this.createdAt = snap.createdAt;
    this._updatedAt = snap.updatedAt;
  }

  public static create(props: CreateCategoryProps): Category {
    const nowIso = (props.now ?? new Date()).toISOString();
    const parsed = parseWithCatalogSchema(
      CategorySnapshotSchema,
      {
        schemaVersion: CATALOG_SCHEMA_VERSION,
        id: props.id,
        slug: props.slug,
        name: props.name,
        description: props.description,
        parentId: props.parentId,
        sortOrder: props.sortOrder ?? 0,
        isActive: props.isActive ?? true,
        channels: props.channels ?? ['POS', 'WEB', 'DELIVERY', 'KIOSK', 'WHOLESALE'],
        version: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'category creation payload'
    );
    if (parsed.parentId === parsed.id) {
      throw new CyclicCategoryError(parsed.id, parsed.parentId);
    }
    return new Category(parsed);
  }

  public static fromSnapshot(raw: unknown): Category {
    const parsed = parseWithCatalogSchema(CategorySnapshotSchema, raw, 'category snapshot');
    return new Category(parsed);
  }

  get slug(): string { return this._slug; }
  get name(): string { return this._name; }
  get description(): string | undefined { return this._description; }
  get parentId(): string | undefined { return this._parentId; }
  get sortOrder(): number { return this._sortOrder; }
  get isActive(): boolean { return this._isActive; }
  get channels(): ReadonlyArray<SalesChannel> { return [...this._channels]; }
  get version(): number { return this._version; }
  get persistedVersion(): number { return this._persistedVersion; }
  get updatedAt(): string { return this._updatedAt; }

  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  public update(
    patch: {
      slug?: string;
      name?: string;
      description?: string;
      parentId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
      channels?: SalesChannel[];
    },
    now = new Date()
  ): void {
    if (patch.slug !== undefined) this._slug = patch.slug.trim();
    if (patch.name !== undefined) this._name = patch.name.trim();
    if (patch.description !== undefined) this._description = patch.description.trim() || undefined;
    if (patch.parentId !== undefined) {
      this._parentId = patch.parentId ?? undefined;
    }
    if (patch.sortOrder !== undefined) this._sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) this._isActive = patch.isActive;
    if (patch.channels !== undefined) this._channels = [...patch.channels];
    this._version += 1;
    this._updatedAt = now.toISOString();
  }

  public toSnapshot(): CategorySnapshot {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      slug: this._slug,
      name: this._name,
      description: this._description,
      parentId: this._parentId,
      sortOrder: this._sortOrder,
      isActive: this._isActive,
      channels: [...this._channels],
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
