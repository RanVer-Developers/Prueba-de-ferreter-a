import { Role } from '../domain/entities/role.js';
import { AuthSession } from '../domain/entities/session.js';
import { AuthUser, LockoutPolicy } from '../domain/entities/user.js';
import { AuthRbacDomainEvent } from '../domain/events/auth-rbac-events.js';
import { AuditEntryJSON } from '../schemas/auth-rbac.schemas.js';

export interface IUserRepository {
  findById(id: string): Promise<AuthUser | null>;
  findByUsername(username: string): Promise<AuthUser | null>;
  findByEmail(email: string): Promise<AuthUser | null>;
  /**
   * Persists the user. Real repositories must enforce optimistic concurrency
   * via `user.persistedVersion` and invoke `user.markPersisted()`.
   */
  save(user: AuthUser): Promise<void>;
}

export interface IRoleRepository {
  findById(id: string): Promise<Role | null>;
  findByCode(code: string): Promise<Role | null>;
  findByIds(ids: ReadonlyArray<string>): Promise<Role[]>;
  listAll(): Promise<Role[]>;
  save(role: Role): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ISessionRepository {
  findById(id: string): Promise<AuthSession | null>;
  findByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  findByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null>;
  findActiveByUserId(userId: string): Promise<AuthSession[]>;
  save(session: AuthSession): Promise<void>;
  revokeAllForUser(userId: string, reason: string, now: Date): Promise<number>;
}

export interface IAuditRepository {
  append(entry: AuditEntryJSON): Promise<void>;
  findByUserId?(userId: string, limit?: number): Promise<AuditEntryJSON[]>;
}

/**
 * Password/PIN hashing port. Concrete adapters wrap Argon2id, bcrypt, scrypt, or WebCrypto PBKDF2.
 */
export interface IPasswordHasher {
  hash(plainText: string): Promise<string>;
  verify(plainText: string, hash: string): Promise<boolean>;
}

/**
 * Opaque token generation and hashing port.
 */
export interface ITokenGenerator {
  generateToken(): Promise<string> | string;
  hashToken(rawToken: string): Promise<string> | string;
}

export interface IClock {
  now(): Date;
}

export const SystemClock: IClock = {
  now: () => new Date(),
};

export interface IIdGenerator {
  nextId(): string;
}

export interface IMfaVerifier {
  verify(userId: string, code: string): Promise<boolean> | boolean;
}

export interface SessionPolicy {
  accessTtlMs: number;
  refreshTtlMs?: number;
  maxConcurrentSessions?: number;
  concurrencyStrategy?: 'REJECT_NEW' | 'REVOKE_OLDEST';
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxAttempts: 5,
  lockDurationMs: 15 * 60 * 1000, // 15 minutes
};

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  accessTtlMs: 60 * 60 * 1000, // 1 hour
  refreshTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export type AuthEventPublisher = (event: AuthRbacDomainEvent) => Promise<void> | void;
