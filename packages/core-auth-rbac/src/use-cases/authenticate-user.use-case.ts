import { z } from 'zod';
import {
  AuthEventPublisher,
  DEFAULT_LOCKOUT_POLICY,
  DEFAULT_SESSION_POLICY,
  IAuditRepository,
  IClock,
  IIdGenerator,
  IMfaVerifier,
  IPasswordHasher,
  ISessionRepository,
  ITokenGenerator,
  IUserRepository,
  SessionPolicy,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { AuthSession } from '../domain/entities/session.js';
import { AuthUser, AuthUserPublicSummary, LockoutPolicy } from '../domain/entities/user.js';
import {
  AccessDeniedError,
  AccountLockedError,
  InvalidCredentialsError,
  MfaRequiredError,
  SessionLimitExceededError,
  UserNotActiveError,
} from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  AuthRbacFeatureProfile,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
  resolveAuthRbacFeatures,
} from '../domain/services/auth-features.js';
import { normalizeScope, scopeMatches } from '../domain/value-objects/permission.js';
import {
  AUTH_RBAC_SCHEMA_VERSION,
  NonEmptyIdSchema,
  Scope,
  ScopeSchema,
  parseWithAuthSchema,
} from '../schemas/auth-rbac.schemas.js';

const SessionPolicySchema = z.object({
  accessTtlMs: z.number().int().positive(),
  refreshTtlMs: z.number().int().positive().optional(),
  maxConcurrentSessions: z.number().int().positive().optional(),
  concurrencyStrategy: z.enum(['REJECT_NEW', 'REVOKE_OLDEST']).optional(),
});

const PasswordAuthSchema = z.object({
  method: z.literal('PASSWORD'),
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  secret: z.string().min(1, 'Password is required.'),
  scope: ScopeSchema.optional(),
  deviceId: NonEmptyIdSchema.optional(),
  ipAddress: z.string().trim().min(1).optional(),
  userAgent: z.string().trim().min(1).optional(),
  mfaCode: z.string().trim().min(1).optional(),
});

const PinAuthSchema = z.object({
  method: z.literal('PIN'),
  identifier: z.string().trim().min(1, 'User id or username is required.'),
  secret: z.string().trim().min(1, 'PIN is required.'),
  scope: ScopeSchema.optional(),
  deviceId: NonEmptyIdSchema.optional(),
  ipAddress: z.string().trim().min(1).optional(),
  userAgent: z.string().trim().min(1).optional(),
  mfaCode: z.string().trim().min(1).optional(),
});

const AuthenticateInputSchema = z.union([PasswordAuthSchema, PinAuthSchema]);

export interface AuthenticateUserInput {
  method?: 'PASSWORD' | 'PIN';
  identifier: string;
  secret: string;
  scope?: Scope;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaCode?: string;
}

export interface AuthenticateUserResult {
  readonly user: AuthUserPublicSummary;
  readonly session?: AuthSession;
  readonly accessToken?: string;
  readonly refreshToken?: string;
}

export interface AuthenticateUserDeps {
  userRepo: IUserRepository;
  passwordHasher: IPasswordHasher;
  sessionRepo?: ISessionRepository;
  tokenGenerator?: ITokenGenerator;
  mfaVerifier?: IMfaVerifier;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  lockoutPolicy?: LockoutPolicy;
  sessionPolicy?: SessionPolicy;
  features?: AuthRbacFeatureProfile;
}

export class AuthenticateUserUseCase {
  private readonly clock: IClock;
  private readonly lockoutPolicy: LockoutPolicy;
  private readonly sessionPolicy: SessionPolicy;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: AuthenticateUserDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.lockoutPolicy = deps.lockoutPolicy ?? DEFAULT_LOCKOUT_POLICY;
    this.sessionPolicy = parseWithAuthSchema(
      SessionPolicySchema,
      deps.sessionPolicy ?? DEFAULT_SESSION_POLICY,
      'session policy'
    );
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async execute(rawInput: AuthenticateUserInput): Promise<AuthenticateUserResult> {
    const input = parseWithAuthSchema(
      AuthenticateInputSchema,
      { method: rawInput.method ?? 'PASSWORD', ...rawInput },
      'authentication input'
    );
    const now = this.clock.now();
    const requestedScope = normalizeScope(input.scope);

    if (input.method === 'PIN') {
      assertAuthRbacFeatureEnabled(this.features, 'pinAuth');
    }
    if (requestedScope) {
      assertAuthRbacFeatureEnabled(this.features, 'scopedRoles');
    }

    const user = await this.findUser(input.identifier, input.method);
    if (!user) {
      await this.recordFailure(input.identifier, undefined, input.method, 'User not found', now);
      throw new InvalidCredentialsError();
    }

    if (user.isLockedAt(now)) {
      await this.recordFailure(input.identifier, user.id, input.method, 'Account locked', now);
      throw new AccountLockedError(user.id, user.lockedUntil);
    }

    const unlocked = user.unlockIfExpired(now);
    const storedHash = input.method === 'PIN' ? user.pinHash : user.passwordHash;
    const isValid = storedHash ? await this.deps.passwordHasher.verify(input.secret, storedHash) : false;

    if (!isValid) {
      if (user.status !== 'ACTIVE') {
        await this.recordFailure(input.identifier, user.id, input.method, `Status ${user.status}`, now);
        throw new InvalidCredentialsError();
      }

      const useBruteForce = isAuthRbacFeatureEnabled(this.features, 'bruteForceProtection');
      const becameLocked = useBruteForce
        ? user.recordFailedAttempt(now, this.lockoutPolicy)
        : false;

      if (useBruteForce || unlocked) {
        await this.deps.userRepo.save(user);
      }

      await this.recordFailure(
        input.identifier,
        user.id,
        input.method,
        'Invalid secret',
        now,
        user.failedAttempts
      );

      if (becameLocked) {
        await this.deps.publishEvent?.({
          type: 'UserLocked',
          userId: user.id,
          lockedUntil: user.lockedUntil,
          failedAttempts: user.failedAttempts,
          occurredAt: now.toISOString(),
        });
        throw new AccountLockedError(user.id, user.lockedUntil);
      }

      throw new InvalidCredentialsError();
    }

    if (user.status !== 'ACTIVE') {
      await this.recordFailure(input.identifier, user.id, input.method, `Status ${user.status}`, now);
      throw new UserNotActiveError(user.id, user.status);
    }

    if (
      user.mfaRequired &&
      this.deps.mfaVerifier &&
      isAuthRbacFeatureEnabled(this.features, 'mfaChallenge')
    ) {
      if (!input.mfaCode) {
        throw new MfaRequiredError(user.id);
      }
      const mfaValid = await this.deps.mfaVerifier.verify(user.id, input.mfaCode);
      if (!mfaValid) {
        await this.recordFailure(input.identifier, user.id, input.method, 'Invalid MFA code', now);
        throw new InvalidCredentialsError('Invalid MFA verification code.');
      }
    }

    if (requestedScope) {
      const useTemporaryGrants = isAuthRbacFeatureEnabled(this.features, 'temporaryRoleGrants');
      const hasAssignmentForScope = user.assignments.some((a) => {
        if (useTemporaryGrants && a.expiresAt && new Date(a.expiresAt).getTime() <= now.getTime()) {
          return false;
        }
        return scopeMatches(a.scope, requestedScope);
      });
      const directScope = normalizeScope(user.directPermissions.scope);
      const hasDirectScope =
        user.directPermissions.allow.length > 0 &&
        directScope !== undefined &&
        scopeMatches(directScope, requestedScope);
      if (!hasAssignmentForScope && !hasDirectScope) {
        await this.recordFailure(
          input.identifier,
          user.id,
          input.method,
          'Requested scope not authorized for user',
          now
        );
        throw new AccessDeniedError(
          'session:create',
          'User does not hold an active assignment covering the requested scope.'
        );
      }
    }

    const hadFailures = user.failedAttempts > 0 || unlocked;
    user.resetFailedAttempts(now);
    if (hadFailures) {
      await this.deps.userRepo.save(user);
    }

    let session: AuthSession | undefined;
    let accessToken: string | undefined;
    let refreshToken: string | undefined;

    if (
      isAuthRbacFeatureEnabled(this.features, 'sessionManagement') &&
      this.deps.sessionRepo &&
      this.deps.tokenGenerator
    ) {
      if (
        this.sessionPolicy.maxConcurrentSessions !== undefined &&
        this.sessionPolicy.maxConcurrentSessions > 0 &&
        isAuthRbacFeatureEnabled(this.features, 'sessionConcurrencyLimit')
      ) {
        const activeSessions = (await this.deps.sessionRepo.findActiveByUserId(user.id))
          .filter((s) => s.status === 'ACTIVE' && !s.isExpiredAt(now) && s.tokenVersion === user.tokenVersion)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (activeSessions.length >= this.sessionPolicy.maxConcurrentSessions) {
          const strategy = this.sessionPolicy.concurrencyStrategy ?? 'REJECT_NEW';
          if (strategy === 'REJECT_NEW') {
            throw new SessionLimitExceededError(user.id, this.sessionPolicy.maxConcurrentSessions);
          }
          const toRevoke = activeSessions.slice(
            0,
            activeSessions.length - this.sessionPolicy.maxConcurrentSessions + 1
          );
          for (const oldSession of toRevoke) {
            oldSession.revoke('Exceeded concurrent session limit', now);
            await this.deps.sessionRepo.save(oldSession);
          }
        }
      }

      accessToken = await this.deps.tokenGenerator.generateToken();
      const tokenHash = await this.deps.tokenGenerator.hashToken(accessToken);

      let refreshTokenHash: string | undefined;
      let refreshExpiresAt: Date | undefined;

      if (
        isAuthRbacFeatureEnabled(this.features, 'refreshTokens') &&
        this.sessionPolicy.refreshTtlMs
      ) {
        refreshToken = await this.deps.tokenGenerator.generateToken();
        refreshTokenHash = await this.deps.tokenGenerator.hashToken(refreshToken);
        refreshExpiresAt = new Date(now.getTime() + this.sessionPolicy.refreshTtlMs);
      }

      session = AuthSession.create({
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        userId: user.id,
        tokenHash,
        refreshTokenHash,
        tokenVersion: user.tokenVersion,
        scope: input.scope,
        deviceId: input.deviceId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt: new Date(now.getTime() + this.sessionPolicy.accessTtlMs),
        refreshExpiresAt,
        now,
      });

      await this.deps.sessionRepo.save(session);

      await this.deps.publishEvent?.({
        type: 'SessionCreated',
        sessionId: session.id,
        userId: user.id,
        scope: session.scope,
        occurredAt: now.toISOString(),
      });
    }

    await this.deps.publishEvent?.({
      type: 'UserAuthenticated',
      userId: user.id,
      method: input.method,
      sessionId: session?.id,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: `AUTH_${input.method}`,
        actorId: user.id,
        targetUserId: user.id,
        scope: input.scope,
        outcome: 'SUCCESS',
        occurredAt: now.toISOString(),
      });
    }

    return {
      user: user.toPublicSummary(),
      ...(session ? { session } : {}),
      ...(accessToken ? { accessToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
    };
  }

  private async findUser(identifier: string, method: 'PASSWORD' | 'PIN'): Promise<AuthUser | null> {
    if (method === 'PIN') {
      const byId = await this.deps.userRepo.findById(identifier);
      if (byId) return byId;
      return this.deps.userRepo.findByUsername(identifier);
    }

    if (identifier.includes('@')) {
      const byEmail = await this.deps.userRepo.findByEmail(identifier);
      if (byEmail) return byEmail;
    }
    return this.deps.userRepo.findByUsername(identifier);
  }

  private async recordFailure(
    identifier: string,
    userId: string | undefined,
    method: 'PASSWORD' | 'PIN',
    reason: string,
    now: Date,
    failedAttempts?: number
  ): Promise<void> {
    await this.deps.publishEvent?.({
      type: 'AuthenticationFailed',
      identifier,
      userId,
      method,
      reason,
      failedAttempts,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: `AUTH_${method}`,
        actorId: userId,
        targetUserId: userId,
        outcome: 'FAILURE',
        reason,
        occurredAt: now.toISOString(),
      });
    }
  }
}
