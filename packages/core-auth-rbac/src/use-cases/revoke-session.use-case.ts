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
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
} from '../domain/services/auth-features.js';
import { AUTH_RBAC_SCHEMA_VERSION } from '../schemas/auth-rbac.schemas.js';

export interface RevokeSessionDeps {
  sessionRepo: ISessionRepository;
  userRepo: IUserRepository;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  features?: AuthRbacFeatureFlags;
}

export class RevokeSessionUseCase {
  private readonly clock: IClock;

  constructor(private readonly deps: RevokeSessionDeps) {
    this.clock = deps.clock ?? SystemClock;
  }

  public async revokeOne(sessionId: string, reason = 'User logout'): Promise<void> {
    assertAuthRbacFeatureEnabled(this.deps.features, 'sessionManagement');
    const now = this.clock.now();
    const session = await this.deps.sessionRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
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

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'SESSION_REVOKED',
        actorId: session.userId,
        targetUserId: session.userId,
        outcome: 'SUCCESS',
        reason,
        occurredAt: now.toISOString(),
      });
    }
  }

  public async revokeAllForUser(userId: string, reason = 'All sessions revoked'): Promise<number> {
    assertAuthRbacFeatureEnabled(this.deps.features, 'sessionManagement');
    const now = this.clock.now();
    const user = await this.deps.userRepo.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
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

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'ALL_SESSIONS_REVOKED',
        actorId: user.id,
        targetUserId: user.id,
        outcome: 'SUCCESS',
        reason,
        occurredAt: now.toISOString(),
      });
    }

    return revokedCount;
  }
}
