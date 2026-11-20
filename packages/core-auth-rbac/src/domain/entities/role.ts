import {
  AUTH_RBAC_SCHEMA_VERSION,
  Permission,
  RoleCode,
  RoleJSON,
  RoleJSONSchema,
  parseWithAuthSchema,
} from '../../schemas/auth-rbac.schemas.js';
import { CyclicRoleInheritanceError, SystemRoleImmutableError } from '../errors/auth-rbac-errors.js';
import { normalizePermission } from '../value-objects/permission.js';

export interface CreateRoleProps {
  id: string;
  code: RoleCode;
  name: string;
  description?: string;
  permissions?: Permission[];
  deniedPermissions?: Permission[];
  inheritsFrom?: string[];
  isSystem?: boolean;
  now?: Date;
}

export class Role {
  public readonly schemaVersion = AUTH_RBAC_SCHEMA_VERSION;
  public readonly id: string;
  public readonly code: RoleCode;
  private _name: string;
  private _description?: string;
  private _permissions: Set<Permission>;
  private _deniedPermissions: Set<Permission>;
  private _inheritsFrom: Set<string>;
  public readonly isSystem: boolean;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;

  private constructor(data: RoleJSON) {
    this.id = data.id;
    this.code = data.code;
    this._name = data.name;
    this._description = data.description;
    this._permissions = new Set(data.permissions);
    this._deniedPermissions = new Set(data.deniedPermissions);
    this._inheritsFrom = new Set(data.inheritsFrom);
    this.isSystem = data.isSystem;
    this._persistedVersion = data.persistedVersion;
    this.createdAt = data.createdAt;
    this._updatedAt = data.updatedAt;
  }

  public static create(props: CreateRoleProps): Role {
    const nowIso = (props.now ?? new Date()).toISOString();
    const parsed = parseWithAuthSchema(
      RoleJSONSchema,
      {
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: props.id,
        code: props.code,
        name: props.name,
        description: props.description,
        permissions: props.permissions ?? [],
        deniedPermissions: props.deniedPermissions ?? [],
        inheritsFrom: props.inheritsFrom ?? [],
        isSystem: props.isSystem ?? false,
        persistedVersion: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'role creation payload'
    );

    if (parsed.inheritsFrom.includes(parsed.id)) {
      throw new CyclicRoleInheritanceError(parsed.id, parsed.id);
    }

    return new Role(parsed);
  }

  public static fromJSON(raw: unknown): Role {
    const parsed = parseWithAuthSchema(RoleJSONSchema, raw, 'role snapshot');
    if (parsed.inheritsFrom.includes(parsed.id)) {
      throw new CyclicRoleInheritanceError(parsed.id, parsed.id);
    }
    return new Role(parsed);
  }

  get name(): string {
    return this._name;
  }

  get description(): string | undefined {
    return this._description;
  }

  get permissions(): ReadonlyArray<Permission> {
    return Array.from(this._permissions);
  }

  get deniedPermissions(): ReadonlyArray<Permission> {
    return Array.from(this._deniedPermissions);
  }

  get inheritsFrom(): ReadonlyArray<string> {
    return Array.from(this._inheritsFrom);
  }

  get persistedVersion(): number {
    return this._persistedVersion;
  }

  get updatedAt(): string {
    return this._updatedAt;
  }

  public updateDetails(details: { name?: string; description?: string }, now = new Date()): void {
    if (details.name !== undefined) {
      const trimmed = details.name.trim();
      if (trimmed.length > 0) {
        this._name = trimmed;
      }
    }
    if (details.description !== undefined) {
      this._description = details.description.trim() || undefined;
    }
    this._updatedAt = now.toISOString();
  }

  public grantPermission(permission: string, now = new Date()): void {
    const normalized = normalizePermission(permission);
    this._permissions.add(normalized);
    this._updatedAt = now.toISOString();
  }

  public revokePermission(permission: string, now = new Date()): boolean {
    const normalized = normalizePermission(permission);
    const removed = this._permissions.delete(normalized);
    if (removed) {
      this._updatedAt = now.toISOString();
    }
    return removed;
  }

  public denyPermission(permission: string, now = new Date()): void {
    const normalized = normalizePermission(permission);
    this._deniedPermissions.add(normalized);
    this._updatedAt = now.toISOString();
  }

  public removeDeniedPermission(permission: string, now = new Date()): boolean {
    const normalized = normalizePermission(permission);
    const removed = this._deniedPermissions.delete(normalized);
    if (removed) {
      this._updatedAt = now.toISOString();
    }
    return removed;
  }

  public setPermissions(permissions: ReadonlyArray<string>, deniedPermissions: ReadonlyArray<string> = [], now = new Date()): void {
    this._permissions = new Set(permissions.map(normalizePermission));
    this._deniedPermissions = new Set(deniedPermissions.map(normalizePermission));
    this._updatedAt = now.toISOString();
  }

  public setInheritance(parentRoleIds: ReadonlyArray<string>, now = new Date()): void {
    for (const parentId of parentRoleIds) {
      if (parentId.trim() === this.id) {
        throw new CyclicRoleInheritanceError(this.id, parentId);
      }
    }
    this._inheritsFrom = new Set(parentRoleIds.map((p) => p.trim()).filter((p) => p.length > 0));
    this._updatedAt = now.toISOString();
  }

  public assertDeletable(): void {
    if (this.isSystem) {
      throw new SystemRoleImmutableError(this.id, 'delete');
    }
  }

  public markPersisted(): void {
    this._persistedVersion += 1;
  }

  public toJSON(): RoleJSON {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      code: this.code,
      name: this._name,
      ...(this._description !== undefined ? { description: this._description } : {}),
      permissions: Array.from(this._permissions),
      deniedPermissions: Array.from(this._deniedPermissions),
      inheritsFrom: Array.from(this._inheritsFrom),
      isSystem: this.isSystem,
      persistedVersion: this._persistedVersion,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
