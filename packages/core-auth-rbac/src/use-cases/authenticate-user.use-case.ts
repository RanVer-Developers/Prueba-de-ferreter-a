import { z } from 'zod';
import {
  AuthEventPublisher,
  DEFAULT_LOCKOUT_POLICY,
  DEFAULT_SESSION_POLICY,
  IAuditRepository,
  IClock,
  IIdGenerator,
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
  AccountLockedError,
  InvalidCredentialsError,
  UserNotActiveError,
} from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
} from '../domain/services/auth-features.js';
import {
  AUTH_RBAC_SCHEMA_VERSION,
  NonEmptyIdSchema,
  Scope,
  ScopeSchema,
  parseWithAuthSchema,
} from '../schemas/auth-rbac.schemas.js';

const PasswordAuthSchema = z.object({
  method: z.literal('PASSWORD'),
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  secret: z.string().min(1, 'Password is required.'),
  scope: ScopeSchema.optional(),
  deviceId: NonEmptyIdSchema.optional(),
  ipAddress: z.string().trim().min(1).optional(),
  userAgent: z.string().trim().min(1).optional(),
});

const PinAuthSchema = z.object({
  method: z.literal('PIN'),
  identifier: z.string().trim().min(1, 'User id or username is required.'),
  secret: z.string().trim().min(1, 'PIN is required.'),
  scope: ScopeSchema.optional(),
  deviceId: NonEmptyIdSchema.optional(),
  ipAddress: z.string().trim().min(1).optional(),
  userAgent: z.string().trim().min(1).optional(),
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
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  lockoutPolicy?: LockoutPolicy;
  sessionPolicy?: SessionPolicy;
  features?: AuthRbacFeatureFlags;
}

export class AuthenticateUserUseCase {
  private readonly clock: IClock;
  private readonly lockoutPolicy: LockoutPolicy;
  private readonly sessionPolicy: SessionPolicy;

  constructor(private readonly deps: AuthenticateUserDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.lockoutPolicy = deps.lockoutPolicy ?? DEFAULT_LOCKOUT_POLICY;
    this.sessionPolicy = deps.sessionPolicy ?? DEFAULT_SESSION_POLICY;
  }

  public async execute(rawInput: AuthenticateUserInput): Promise<AuthenticateUserResult> {
    const input = parseWithAuthSchema(
      AuthenticateInputSchema,
      { method: rawInput.method ?? 'PASSWORD', ...rawInput },
      'authentication input'
    );
    const now = this.clock.now();

    if (input.method === 'PIN') {
      assertAuthRbacFeatureEnabled(this.deps.features, 'pinAuth');
    }
    if (input.scope && (input.scope.tenantId || input.scope.branchId)) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'scopedRoles');
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
    if (user.status !== 'ACTIVE') {
      if (unlocked) {
        await this.deps.userRepo.save(user);
      }
      await this.recordFailure(input.identifier, user.id, input.method, `Status ${user.status}`, now);
      throw new UserNotActiveError(user.id, user.status);
    }

    const storedHash = input.method === 'PIN' ? user.pinHash : user.passwordHash;
    const isValid = storedHash ? await this.deps.passwordHasher.verify(input.secret, storedHash) : false;

    if (!isValid) {
      const useBruteForce = isAuthRbacFeatureEnabled(this.deps.features, 'bruteForceProtection');
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

    const hadFailures = user.failedAttempts > 0 || unlocked;
    user.resetFailedAttempts(now);
    if (hadFailures) {
      await this.deps.userRepo.save(user);
    }

    let session: AuthSession | undefined;
    let accessToken: string | undefined;
    let refreshToken: string | undefined;

    if (
      isAuthRbacFeatureEnabled(this.deps.features, 'sessionManagement') &&
      this.deps.sessionRepo &&
      this.deps.tokenGenerator
    ) {
      accessToken = await this.deps.tokenGenerator.generateToken();
      const tokenHash = await this.deps.tokenGenerator.hashToken(accessToken);

      let refreshTokenHash: string | undefined;
      let refreshExpiresAt: Date | undefined;

      if (
        isAuthRbacFeatureEnabled(this.deps.features, 'refreshTokens') &&
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

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
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

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
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
