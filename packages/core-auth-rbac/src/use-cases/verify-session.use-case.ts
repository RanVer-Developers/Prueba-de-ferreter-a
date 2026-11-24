import { z } from 'zod';
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
  AuthRbacFeatureProfile,
  assertAuthRbacFeatureEnabled,
  resolveAuthRbacFeatures,
} from '../domain/services/auth-features.js';
import { parseWithAuthSchema } from '../schemas/auth-rbac.schemas.js';

const VerifySessionInputSchema = z.object({
  accessToken: z.string(),
  touchActivity: z.boolean().optional(),
});

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
  features?: AuthRbacFeatureProfile;
}

export class VerifySessionUseCase {
  private readonly clock: IClock;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: VerifySessionDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async execute(rawInput: VerifySessionInput): Promise<VerifySessionResult> {
    assertAuthRbacFeatureEnabled(this.features, 'sessionManagement');
    const input = parseWithAuthSchema(VerifySessionInputSchema, rawInput, 'verify session input');
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

    session.assertActive(now, user.tokenVersion);

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
