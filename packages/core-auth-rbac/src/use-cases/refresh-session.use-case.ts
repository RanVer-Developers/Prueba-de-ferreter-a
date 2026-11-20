import {
  AuthEventPublisher,
  DEFAULT_SESSION_POLICY,
  IClock,
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
  assertAuthRbacFeatureEnabled,
} from '../domain/services/auth-features.js';

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
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  sessionPolicy?: SessionPolicy;
  features?: AuthRbacFeatureFlags;
}

export class RefreshSessionUseCase {
  private readonly clock: IClock;
  private readonly sessionPolicy: SessionPolicy;

  constructor(private readonly deps: RefreshSessionDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.sessionPolicy = deps.sessionPolicy ?? DEFAULT_SESSION_POLICY;
  }

  public async execute(input: RefreshSessionInput): Promise<RefreshSessionResult> {
    assertAuthRbacFeatureEnabled(this.deps.features, 'sessionManagement');
    assertAuthRbacFeatureEnabled(this.deps.features, 'refreshTokens');

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

    if (user.isLockedAt(now)) {
      throw new AccountLockedError(user.id, user.lockedUntil);
    }
    if (user.status !== 'ACTIVE') {
      throw new UserNotActiveError(user.id, user.status);
    }

    session.assertRefreshable(now, user.tokenVersion);

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

    return {
      user: user.toPublicSummary(),
      session,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    };
  }
}
