import {
  AuthEventPublisher,
  IAuditRepository,
  IClock,
  IIdGenerator,
  ISessionRepository,
  IUserRepository,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { SessionNotFoundError, UserNotFoundError } from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  AuthRbacFeatureProfile,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
  resolveAuthRbacFeatures,
} from '../domain/services/auth-features.js';
import { AUTH_RBAC_SCHEMA_VERSION, NonEmptyIdSchema, parseWithAuthSchema } from '../schemas/auth-rbac.schemas.js';

export interface RevokeSessionDeps {
  sessionRepo: ISessionRepository;
  userRepo: IUserRepository;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  features?: AuthRbacFeatureProfile;
}

export class RevokeSessionUseCase {
  private readonly clock: IClock;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: RevokeSessionDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async revokeOne(sessionId: string, reason = 'User logout', actorId?: string): Promise<void> {
    assertAuthRbacFeatureEnabled(this.features, 'sessionManagement');
    const validSessionId = parseWithAuthSchema(NonEmptyIdSchema, sessionId, 'sessionId');
    const validActorId =
      actorId !== undefined ? parseWithAuthSchema(NonEmptyIdSchema, actorId, 'actorId') : undefined;
    const now = this.clock.now();
    const session = await this.deps.sessionRepo.findById(validSessionId);
    if (!session) {
      throw new SessionNotFoundError(validSessionId);
    }

    if (session.status === 'REVOKED') {
      return;
    }

    session.revoke(reason, now);
    await this.deps.sessionRepo.save(session);

    await this.deps.publishEvent?.({
      type: 'SessionRevoked',
      sessionId: session.id,
      userId: session.userId,
      reason,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'SESSION_REVOKED',
        actorId: validActorId ?? session.userId,
        targetUserId: session.userId,
        outcome: 'SUCCESS',
        reason,
        occurredAt: now.toISOString(),
      });
    }
  }

  public async revokeAllForUser(
    userId: string,
    reason = 'All sessions revoked',
    actorId?: string
  ): Promise<number> {
    assertAuthRbacFeatureEnabled(this.features, 'sessionManagement');
    const validUserId = parseWithAuthSchema(NonEmptyIdSchema, userId, 'userId');
    const validActorId =
      actorId !== undefined ? parseWithAuthSchema(NonEmptyIdSchema, actorId, 'actorId') : undefined;
    const now = this.clock.now();
    const user = await this.deps.userRepo.findById(validUserId);
    if (!user) {
      throw new UserNotFoundError(validUserId);
    }

    user.bumpTokenVersion(now);
    await this.deps.userRepo.save(user);
    const revokedCount = await this.deps.sessionRepo.revokeAllForUser(user.id, reason, now);

    await this.deps.publishEvent?.({
      type: 'AllUserSessionsRevoked',
      userId: user.id,
      reason,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'ALL_SESSIONS_REVOKED',
        actorId: validActorId ?? user.id,
        targetUserId: user.id,
        outcome: 'SUCCESS',
        reason,
        occurredAt: now.toISOString(),
      });
    }

    return revokedCount;
  }
}
