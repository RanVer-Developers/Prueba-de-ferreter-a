import {
  AUTH_RBAC_SCHEMA_VERSION,
  AuthUserJSON,
  AuthUserJSONSchema,
  DirectPermissions,
  Permission,
  RoleAssignment,
  Scope,
  UserStatus,
  parseWithAuthSchema,
} from '../../schemas/auth-rbac.schemas.js';
import { normalizePermission, normalizeScope, sameScope } from '../value-objects/permission.js';

export interface LockoutPolicy {
  maxAttempts: number;
  lockDurationMs: number;
}

export interface AuthUserPublicSummary {
  readonly id: string;
  readonly username: string;
  readonly email?: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly assignments: ReadonlyArray<RoleAssignment>;
  readonly tokenVersion: number;
}

export interface CreateUserProps {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  status?: UserStatus;
  passwordHash?: string;
  pinHash?: string;
  assignments?: RoleAssignment[];
  directPermissions?: { allow?: string[]; deny?: string[] };
  metadata?: Record<string, string | number | boolean>;
  now?: Date;
}

export class AuthUser {
  public readonly schemaVersion = AUTH_RBAC_SCHEMA_VERSION;
  public readonly id: string;
  public readonly username: string;
  private _email?: string;
  private _displayName: string;
  private _status: UserStatus;
  private _passwordHash?: string;
  private _pinHash?: string;
  private _assignments: RoleAssignment[];
  private _allowPermissions: Set<Permission>;
  private _denyPermissions: Set<Permission>;
  private _failedAttempts: number;
  private _lockedUntil?: string;
  private _tokenVersion: number;
  private _metadata?: Record<string, string | number | boolean>;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;

  private constructor(data: AuthUserJSON) {
    this.id = data.id;
    this.username = data.username;
    this._email = data.email;
    this._displayName = data.displayName;
    this._status = data.status;
    this._passwordHash = data.passwordHash;
    this._pinHash = data.pinHash;
    this._assignments = data.assignments.map((a) => ({
      ...a,
      ...(a.scope ? { scope: normalizeScope(a.scope) } : {}),
    }));
    this._allowPermissions = new Set(data.directPermissions.allow);
    this._denyPermissions = new Set(data.directPermissions.deny);
    this._failedAttempts = data.failedAttempts;
    this._lockedUntil = data.lockedUntil;
    this._tokenVersion = data.tokenVersion;
    this._metadata = data.metadata ? { ...data.metadata } : undefined;
    this._persistedVersion = data.persistedVersion;
    this.createdAt = data.createdAt;
    this._updatedAt = data.updatedAt;
  }

  public static create(props: CreateUserProps): AuthUser {
    const nowIso = (props.now ?? new Date()).toISOString();
    const parsed = parseWithAuthSchema(
      AuthUserJSONSchema,
      {
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: props.id,
        username: props.username,
        email: props.email,
        displayName: props.displayName,
        status: props.status ?? 'ACTIVE',
        passwordHash: props.passwordHash,
        pinHash: props.pinHash,
        assignments: props.assignments ?? [],
        directPermissions: props.directPermissions ?? { allow: [], deny: [] },
        failedAttempts: 0,
        tokenVersion: 1,
        metadata: props.metadata,
        persistedVersion: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'user creation payload'
    );
    return new AuthUser(parsed);
  }

  public static fromJSON(raw: unknown): AuthUser {
    const parsed = parseWithAuthSchema(AuthUserJSONSchema, raw, 'user snapshot');
    return new AuthUser(parsed);
  }

  get email(): string | undefined {
    return this._email;
  }

  get displayName(): string {
    return this._displayName;
  }

  get status(): UserStatus {
    return this._status;
  }

  get passwordHash(): string | undefined {
    return this._passwordHash;
  }

  get pinHash(): string | undefined {
    return this._pinHash;
  }

  get assignments(): ReadonlyArray<RoleAssignment> {
    return this._assignments.map((a) => ({
      ...a,
      ...(a.scope ? { scope: { ...a.scope } } : {}),
    }));
  }

  get directPermissions(): DirectPermissions {
    return {
      allow: Array.from(this._allowPermissions),
      deny: Array.from(this._denyPermissions),
    };
  }

  get failedAttempts(): number {
    return this._failedAttempts;
  }

  get lockedUntil(): string | undefined {
    return this._lockedUntil;
  }

  get tokenVersion(): number {
    return this._tokenVersion;
  }

  get metadata(): Record<string, string | number | boolean> | undefined {
    return this._metadata ? { ...this._metadata } : undefined;
  }

  get persistedVersion(): number {
    return this._persistedVersion;
  }

  get updatedAt(): string {
    return this._updatedAt;
  }

  public isLockedAt(now: Date): boolean {
    if (this._status === 'LOCKED') {
      if (!this._lockedUntil) return true;
      return new Date(this._lockedUntil).getTime() > now.getTime();
    }
    return false;
  }

  /**
   * Unlocks a temporarily locked account if `lockedUntil` has elapsed.
   */
  public unlockIfExpired(now: Date): boolean {
    if (this._status === 'LOCKED' && this._lockedUntil) {
      if (new Date(this._lockedUntil).getTime() <= now.getTime()) {
        this._status = 'ACTIVE';
        this._lockedUntil = undefined;
        this._failedAttempts = 0;
        this._updatedAt = now.toISOString();
        return true;
      }
    }
    return false;
  }

  public recordFailedAttempt(now: Date, policy?: LockoutPolicy): boolean {
    this._failedAttempts += 1;
    this._updatedAt = now.toISOString();

    if (policy && policy.maxAttempts > 0 && this._failedAttempts >= policy.maxAttempts) {
      this._status = 'LOCKED';
      this._lockedUntil =
        policy.lockDurationMs > 0
          ? new Date(now.getTime() + policy.lockDurationMs).toISOString()
          : undefined;
      return true;
    }
    return false;
  }

  public resetFailedAttempts(now = new Date()): void {
    if (this._failedAttempts === 0 && !this._lockedUntil && this._status !== 'LOCKED') {
      return;
    }
    this._failedAttempts = 0;
    this._lockedUntil = undefined;
    if (this._status === 'LOCKED') {
      this._status = 'ACTIVE';
    }
    this._updatedAt = now.toISOString();
  }

  public assignRole(roleId: string, scope: Scope | undefined, now = new Date(), assignedBy?: string): boolean {
    const normalizedScope = normalizeScope(scope);
    const exists = this._assignments.some((a) => a.roleId === roleId && sameScope(a.scope, normalizedScope));
    if (exists) {
      return false;
    }
    this._assignments.push({
      roleId,
      ...(normalizedScope ? { scope: normalizedScope } : {}),
      assignedAt: now.toISOString(),
      ...(assignedBy ? { assignedBy } : {}),
    });
    this._updatedAt = now.toISOString();
    return true;
  }

  public revokeRole(roleId: string, scope: Scope | undefined, now = new Date()): boolean {
    const normalizedScope = normalizeScope(scope);
    const before = this._assignments.length;
    this._assignments = this._assignments.filter(
      (a) => !(a.roleId === roleId && sameScope(a.scope, normalizedScope))
    );
    if (this._assignments.length !== before) {
      this._updatedAt = now.toISOString();
      return true;
    }
    return false;
  }

  public grantDirectPermission(permission: string, now = new Date()): void {
    const normalized = normalizePermission(permission);
    this._allowPermissions.add(normalized);
    this._updatedAt = now.toISOString();
  }

  public revokeDirectAllowPermission(permission: string, now = new Date()): boolean {
    const normalized = normalizePermission(permission);
    const deleted = this._allowPermissions.delete(normalized);
    if (deleted) {
      this._updatedAt = now.toISOString();
    }
    return deleted;
  }

  public denyDirectPermission(permission: string, now = new Date()): void {
    const normalized = normalizePermission(permission);
    this._denyPermissions.add(normalized);
    this._updatedAt = now.toISOString();
  }

  public revokeDirectDenyPermission(permission: string, now = new Date()): boolean {
    const normalized = normalizePermission(permission);
    const deleted = this._denyPermissions.delete(normalized);
    if (deleted) {
      this._updatedAt = now.toISOString();
    }
    return deleted;
  }

  public changePasswordHash(newHash: string, now = new Date()): void {
    this._passwordHash = newHash;
    this._tokenVersion += 1;
    this._updatedAt = now.toISOString();
  }

  public changePinHash(newHash: string | undefined, now = new Date()): void {
    this._pinHash = newHash;
    this._updatedAt = now.toISOString();
  }

  public bumpTokenVersion(now = new Date()): void {
    this._tokenVersion += 1;
    this._updatedAt = now.toISOString();
  }

  public setStatus(status: UserStatus, now = new Date()): void {
    this._status = status;
    if (status === 'ACTIVE') {
      this._failedAttempts = 0;
      this._lockedUntil = undefined;
    } else if (status === 'INACTIVE' || status === 'SUSPENDED' || status === 'LOCKED') {
      this._tokenVersion += 1;
    }
    this._updatedAt = now.toISOString();
  }

  public markPersisted(): void {
    this._persistedVersion += 1;
  }

  public toPublicSummary(): AuthUserPublicSummary {
    return {
      id: this.id,
      username: this.username,
      ...(this._email !== undefined ? { email: this._email } : {}),
      displayName: this._displayName,
      status: this._status,
      assignments: this.assignments,
      tokenVersion: this._tokenVersion,
    };
  }

  public toJSON(): AuthUserJSON {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      username: this.username,
      ...(this._email !== undefined ? { email: this._email } : {}),
      displayName: this._displayName,
      status: this._status,
      ...(this._passwordHash !== undefined ? { passwordHash: this._passwordHash } : {}),
      ...(this._pinHash !== undefined ? { pinHash: this._pinHash } : {}),
      assignments: this.assignments as RoleAssignment[],
      directPermissions: this.directPermissions,
      failedAttempts: this._failedAttempts,
      ...(this._lockedUntil !== undefined ? { lockedUntil: this._lockedUntil } : {}),
      tokenVersion: this._tokenVersion,
      ...(this._metadata !== undefined ? { metadata: { ...this._metadata } } : {}),
      persistedVersion: this._persistedVersion,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
