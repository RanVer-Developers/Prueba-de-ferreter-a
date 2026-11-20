import {
  IClock,
  ISessionRepository,
  ITokenGenerator,
  IUserRepository,
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

export interface VerifySessionInput {
  accessToken: string;
  touchActivity?: boolean;
}

export interface VerifySessionResult {
  readonly user: AuthUserPublicSummary;
  readonly session: AuthSession;
}

export interface VerifySessionDeps {
  sessionRepo: ISessionRepository;
  userRepo: IUserRepository;
  tokenGenerator: ITokenGenerator;
  clock?: IClock;
  features?: AuthRbacFeatureFlags;
}

export class VerifySessionUseCase {
  private readonly clock: IClock;

  constructor(private readonly deps: VerifySessionDeps) {
    this.clock = deps.clock ?? SystemClock;
  }

  public async execute(input: VerifySessionInput): Promise<VerifySessionResult> {
    assertAuthRbacFeatureEnabled(this.deps.features, 'sessionManagement');
    const rawToken = input.accessToken.trim();
    if (!rawToken) {
      throw new SessionInvalidError('Access token cannot be empty.');
    }

    const now = this.clock.now();
    const tokenHash = await this.deps.tokenGenerator.hashToken(rawToken);
    const session = await this.deps.sessionRepo.findByTokenHash(tokenHash);
    if (!session) {
      throw new SessionInvalidError('Session not found for token.');
    }

    const user = await this.deps.userRepo.findById(session.userId);
    if (!user) {
      throw new UserNotFoundError(session.userId);
    }

    if (user.isLockedAt(now)) {
      throw new AccountLockedError(user.id, user.lockedUntil);
    }
    if (user.status !== 'ACTIVE' && !user.unlockIfExpired(now)) {
      throw new UserNotActiveError(user.id, user.status);
    }

    session.assertActive(now, user.tokenVersion);

    if (input.touchActivity) {
      session.touch(now);
      await this.deps.sessionRepo.save(session);
    }

    return {
      user: user.toPublicSummary(),
      session,
    };
  }
}
