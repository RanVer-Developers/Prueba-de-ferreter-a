import { z } from 'zod';
import {
  AuthEventPublisher,
  DEFAULT_SESSION_POLICY,
  IAuditRepository,
  IClock,
  IIdGenerator,
  ISessionRepository,
  ITokenGenerator,
  IUserRepository,
  SessionPolicy,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { AuthSession } from '../domain/entities/session.js';
import { AuthUserPublicSummary } from '../domain/entities/user.js';
import {
  AccountLockedError,
  SessionInvalidError,
  UserNotActiveError,
  UserNotFoundError,
} from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  AuthRbacFeatureProfile,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
  resolveAuthRbacFeatures,
} from '../domain/services/auth-features.js';
import { AUTH_RBAC_SCHEMA_VERSION, parseWithAuthSchema } from '../schemas/auth-rbac.schemas.js';

const RefreshSessionInputSchema = z.object({
  refreshToken: z.string(),
});

const SessionPolicySchema = z.object({
  accessTtlMs: z.number().int().positive(),
  refreshTtlMs: z.number().int().positive().optional(),
});

export interface RefreshSessionInput {
  refreshToken: string;
}

export interface RefreshSessionResult {
  readonly user: AuthUserPublicSummary;
  readonly session: AuthSession;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface RefreshSessionDeps {
  sessionRepo: ISessionRepository;
  userRepo: IUserRepository;
  tokenGenerator: ITokenGenerator;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  sessionPolicy?: SessionPolicy;
  features?: AuthRbacFeatureProfile;
}

export class RefreshSessionUseCase {
  private readonly clock: IClock;
  private readonly sessionPolicy: SessionPolicy;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: RefreshSessionDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.sessionPolicy = parseWithAuthSchema(
      SessionPolicySchema,
      deps.sessionPolicy ?? DEFAULT_SESSION_POLICY,
      'session policy'
    );
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async execute(rawInput: RefreshSessionInput): Promise<RefreshSessionResult> {
    assertAuthRbacFeatureEnabled(this.features, 'sessionManagement');
    assertAuthRbacFeatureEnabled(this.features, 'refreshTokens');

    const input = parseWithAuthSchema(RefreshSessionInputSchema, rawInput, 'refresh session input');
    const rawRefreshToken = input.refreshToken.trim();
    if (!rawRefreshToken) {
      throw new SessionInvalidError('Refresh token cannot be empty.');
    }

    const now = this.clock.now();
    const refreshHash = await this.deps.tokenGenerator.hashToken(rawRefreshToken);
    const session = await this.deps.sessionRepo.findByRefreshTokenHash(refreshHash);
    if (!session) {
      throw new SessionInvalidError('Refresh token is unknown or already rotated.');
    }

    const user = await this.deps.userRepo.findById(session.userId);
    if (!user) {
      throw new UserNotFoundError(session.userId);
    }

    session.assertRefreshable(now, user.tokenVersion);

    if (user.isLockedAt(now)) {
      throw new AccountLockedError(user.id, user.lockedUntil);
    }
    const unlocked = user.unlockIfExpired(now);
    if (user.status !== 'ACTIVE') {
      throw new UserNotActiveError(user.id, user.status);
    }

    if (unlocked) {
      await this.deps.userRepo.save(user);
    }

    const nextAccessToken = await this.deps.tokenGenerator.generateToken();
    const nextRefreshToken = await this.deps.tokenGenerator.generateToken();
    const nextTokenHash = await this.deps.tokenGenerator.hashToken(nextAccessToken);
    const nextRefreshHash = await this.deps.tokenGenerator.hashToken(nextRefreshToken);

    const nextExpiresAt = new Date(now.getTime() + this.sessionPolicy.accessTtlMs);
    const nextRefreshExpiresAt = this.sessionPolicy.refreshTtlMs
      ? new Date(now.getTime() + this.sessionPolicy.refreshTtlMs)
      : undefined;

    session.rotateTokens(nextTokenHash, nextExpiresAt, nextRefreshHash, nextRefreshExpiresAt, now);
    await this.deps.sessionRepo.save(session);

    await this.deps.publishEvent?.({
      type: 'SessionRefreshed',
      sessionId: session.id,
      userId: user.id,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'SESSION_REFRESHED',
        actorId: user.id,
        targetUserId: user.id,
        scope: session.scope,
        outcome: 'SUCCESS',
        occurredAt: now.toISOString(),
      });
    }

    return {
      user: user.toPublicSummary(),
      session,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    };
  }
}
