import {
  AUTH_RBAC_SCHEMA_VERSION,
  AuthSessionJSON,
  AuthSessionJSONSchema,
  Scope,
  SessionStatus,
  parseWithAuthSchema,
} from '../../schemas/auth-rbac.schemas.js';
import { SessionInvalidError } from '../errors/auth-rbac-errors.js';
import { normalizeScope } from '../value-objects/permission.js';

export interface CreateSessionProps {
  id: string;
  userId: string;
  tokenHash: string;
  refreshTokenHash?: string;
  tokenVersion: number;
  scope?: Scope;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  refreshExpiresAt?: Date;
  now?: Date;
}

export class AuthSession {
  public readonly schemaVersion = AUTH_RBAC_SCHEMA_VERSION;
  public readonly id: string;
  public readonly userId: string;
  private _tokenHash: string;
  private _refreshTokenHash?: string;
  public readonly tokenVersion: number;
  public readonly scope?: Scope;
  private _status: SessionStatus;
  public readonly deviceId?: string;
  public readonly ipAddress?: string;
  public readonly userAgent?: string;
  public readonly createdAt: string;
  private _expiresAt: string;
  private _refreshExpiresAt?: string;
  private _lastActivityAt: string;
  private _revokedAt?: string;
  private _revokedReason?: string;

  private constructor(data: AuthSessionJSON) {
    this.id = data.id;
    this.userId = data.userId;
    this._tokenHash = data.tokenHash;
    this._refreshTokenHash = data.refreshTokenHash;
    this.tokenVersion = data.tokenVersion;
    this.scope = normalizeScope(data.scope);
    this._status = data.status;
    this.deviceId = data.deviceId;
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.createdAt = data.createdAt;
    this._expiresAt = data.expiresAt;
    this._refreshExpiresAt = data.refreshExpiresAt;
    this._lastActivityAt = data.lastActivityAt;
    this._revokedAt = data.revokedAt;
    this._revokedReason = data.revokedReason;
  }

  public static create(props: CreateSessionProps): AuthSession {
    const nowIso = (props.now ?? new Date()).toISOString();
    const parsed = parseWithAuthSchema(
      AuthSessionJSONSchema,
      {
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: props.id,
        userId: props.userId,
        tokenHash: props.tokenHash,
        refreshTokenHash: props.refreshTokenHash,
        tokenVersion: props.tokenVersion,
        scope: props.scope,
        status: 'ACTIVE',
        deviceId: props.deviceId,
        ipAddress: props.ipAddress,
        userAgent: props.userAgent,
        createdAt: nowIso,
        expiresAt: props.expiresAt.toISOString(),
        refreshExpiresAt: props.refreshExpiresAt?.toISOString(),
        lastActivityAt: nowIso,
      },
      'session creation payload'
    );
    return new AuthSession(parsed);
  }

  public static fromJSON(raw: unknown): AuthSession {
    const parsed = parseWithAuthSchema(AuthSessionJSONSchema, raw, 'session snapshot');
    return new AuthSession(parsed);
  }

  get tokenHash(): string {
    return this._tokenHash;
  }

  get refreshTokenHash(): string | undefined {
    return this._refreshTokenHash;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get expiresAt(): string {
    return this._expiresAt;
  }

  get refreshExpiresAt(): string | undefined {
    return this._refreshExpiresAt;
  }

  get lastActivityAt(): string {
    return this._lastActivityAt;
  }

  get revokedAt(): string | undefined {
    return this._revokedAt;
  }

  get revokedReason(): string | undefined {
    return this._revokedReason;
  }

  public isExpiredAt(now: Date): boolean {
    return new Date(this._expiresAt).getTime() <= now.getTime();
  }

  public isRefreshExpiredAt(now: Date): boolean {
    if (!this._refreshExpiresAt) return this.isExpiredAt(now);
    return new Date(this._refreshExpiresAt).getTime() <= now.getTime();
  }

  public assertActive(now: Date, currentUserTokenVersion?: number): void {
    if (this._status === 'REVOKED') {
      throw new SessionInvalidError(this._revokedReason ?? 'Session has been revoked.');
    }
    if (currentUserTokenVersion !== undefined && this.tokenVersion !== currentUserTokenVersion) {
      throw new SessionInvalidError('Session token version is outdated.');
    }
    if (this.isExpiredAt(now)) {
      throw new SessionInvalidError('Session has expired.');
    }
  }

  public assertRefreshable(now: Date, currentUserTokenVersion?: number): void {
    if (this._status === 'REVOKED') {
      throw new SessionInvalidError(this._revokedReason ?? 'Session has been revoked.');
    }
    if (currentUserTokenVersion !== undefined && this.tokenVersion !== currentUserTokenVersion) {
      throw new SessionInvalidError('Session token version is outdated.');
    }
    if (this.isRefreshExpiredAt(now)) {
      throw new SessionInvalidError('Refresh token has expired.');
    }
  }

  public touch(now = new Date()): void {
    this._lastActivityAt = now.toISOString();
  }

  public rotateTokens(
    newTokenHash: string,
    newExpiresAt: Date,
    newRefreshTokenHash?: string,
    newRefreshExpiresAt?: Date,
    now = new Date()
  ): void {
    this._tokenHash = newTokenHash;
    this._expiresAt = newExpiresAt.toISOString();
    if (newRefreshTokenHash !== undefined) {
      this._refreshTokenHash = newRefreshTokenHash;
    }
    if (newRefreshExpiresAt !== undefined) {
      this._refreshExpiresAt = newRefreshExpiresAt.toISOString();
    }
    this._lastActivityAt = now.toISOString();
  }

  public revoke(reason = 'Revoked', now = new Date()): void {
    if (this._status === 'REVOKED') return;
    this._status = 'REVOKED';
    this._revokedAt = now.toISOString();
    this._revokedReason = reason;
  }

  public toJSON(): AuthSessionJSON {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      userId: this.userId,
      tokenHash: this._tokenHash,
      ...(this._refreshTokenHash !== undefined ? { refreshTokenHash: this._refreshTokenHash } : {}),
      tokenVersion: this.tokenVersion,
      ...(this.scope ? { scope: { ...this.scope } } : {}),
      status: this._status,
      ...(this.deviceId !== undefined ? { deviceId: this.deviceId } : {}),
      ...(this.ipAddress !== undefined ? { ipAddress: this.ipAddress } : {}),
      ...(this.userAgent !== undefined ? { userAgent: this.userAgent } : {}),
      createdAt: this.createdAt,
      expiresAt: this._expiresAt,
      ...(this._refreshExpiresAt !== undefined ? { refreshExpiresAt: this._refreshExpiresAt } : {}),
      lastActivityAt: this._lastActivityAt,
      ...(this._revokedAt !== undefined ? { revokedAt: this._revokedAt } : {}),
      ...(this._revokedReason !== undefined ? { revokedReason: this._revokedReason } : {}),
    };
  }
}
