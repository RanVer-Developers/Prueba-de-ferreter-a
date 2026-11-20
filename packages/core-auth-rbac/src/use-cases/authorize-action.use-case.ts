import {
  AuthEventPublisher,
  DEFAULT_LOCKOUT_POLICY,
  IAuditRepository,
  IClock,
  IIdGenerator,
  IPasswordHasher,
  IRoleRepository,
  IUserRepository,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { AuthUser, LockoutPolicy } from '../domain/entities/user.js';
import {
  AccountLockedError,
  InvalidCredentialsError,
  SelfApprovalNotAllowedError,
  UserNotActiveError,
  UserNotFoundError,
} from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
} from '../domain/services/auth-features.js';
import {
  AuthorizationDecision,
  RbacEvaluatorService,
} from '../domain/services/rbac-evaluator.service.js';
import { AUTH_RBAC_SCHEMA_VERSION, Scope } from '../schemas/auth-rbac.schemas.js';

export interface AuthorizeActionInput {
  userId: string;
  permission: string;
  scope?: Scope;
}

export interface SupervisorOverrideInput {
  requesterId: string;
  approverIdentifier: string;
  approverSecret: string;
  authMethod?: 'PIN' | 'PASSWORD';
  permission: string;
  scope?: Scope;
}

export interface AuthorizeActionDeps {
  userRepo: IUserRepository;
  roleRepo: IRoleRepository;
  passwordHasher?: IPasswordHasher;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  lockoutPolicy?: LockoutPolicy;
  evaluator?: RbacEvaluatorService;
  features?: AuthRbacFeatureFlags;
}

export class AuthorizeActionUseCase {
  private readonly clock: IClock;
  private readonly evaluator: RbacEvaluatorService;
  private readonly lockoutPolicy: LockoutPolicy;

  constructor(private readonly deps: AuthorizeActionDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.evaluator = deps.evaluator ?? new RbacEvaluatorService();
    this.lockoutPolicy = deps.lockoutPolicy ?? DEFAULT_LOCKOUT_POLICY;
  }

  public async evaluate(input: AuthorizeActionInput): Promise<AuthorizationDecision> {
    if (input.scope && (input.scope.tenantId || input.scope.branchId)) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'scopedRoles');
    }

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    const allRoles = await this.deps.roleRepo.listAll();
    const rolesById = new Map(allRoles.map((r) => [r.id, r]));

    return this.evaluator.evaluatePermission({
      user,
      rolesById,
      permission: input.permission,
      scope: input.scope,
      now: this.clock.now(),
      features: this.deps.features,
    });
  }

  public async assert(input: AuthorizeActionInput): Promise<AuthorizationDecision> {
    if (input.scope && (input.scope.tenantId || input.scope.branchId)) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'scopedRoles');
    }

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    const allRoles = await this.deps.roleRepo.listAll();
    const rolesById = new Map(allRoles.map((r) => [r.id, r]));

    return this.evaluator.assertPermission({
      user,
      rolesById,
      permission: input.permission,
      scope: input.scope,
      now: this.clock.now(),
      features: this.deps.features,
    });
  }

  public async authorizeSupervisorOverride(
    input: SupervisorOverrideInput
  ): Promise<{ approverId: string; decision: AuthorizationDecision }> {
    assertAuthRbacFeatureEnabled(this.deps.features, 'supervisorOverride');
    const method = input.authMethod ?? 'PIN';
    if (method === 'PIN') {
      assertAuthRbacFeatureEnabled(this.deps.features, 'pinAuth');
    }
    if (input.scope && (input.scope.tenantId || input.scope.branchId)) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'scopedRoles');
    }

    if (!this.deps.passwordHasher) {
      throw new InvalidCredentialsError('Password/PIN verification adapter is required for supervisor override.');
    }

    const now = this.clock.now();
    const approver = await this.findApprover(input.approverIdentifier, method);
    if (!approver) {
      throw new InvalidCredentialsError('Supervisor credentials are invalid.');
    }

    if (approver.id === input.requesterId) {
      throw new SelfApprovalNotAllowedError(approver.id, input.permission);
    }

    if (approver.isLockedAt(now)) {
      throw new AccountLockedError(approver.id, approver.lockedUntil);
    }
    const unlocked = approver.unlockIfExpired(now);
    if (approver.status !== 'ACTIVE') {
      if (unlocked) {
        await this.deps.userRepo.save(approver);
      }
      throw new UserNotActiveError(approver.id, approver.status);
    }

    const storedHash = method === 'PIN' ? approver.pinHash : approver.passwordHash;
    const validSecret = storedHash
      ? await this.deps.passwordHasher.verify(input.approverSecret, storedHash)
      : false;

    if (!validSecret) {
      const useBruteForce = isAuthRbacFeatureEnabled(this.deps.features, 'bruteForceProtection');
      const becameLocked = useBruteForce
        ? approver.recordFailedAttempt(now, this.lockoutPolicy)
        : false;
      if (useBruteForce || unlocked) {
        await this.deps.userRepo.save(approver);
      }
      if (becameLocked) {
        throw new AccountLockedError(approver.id, approver.lockedUntil);
      }
      throw new InvalidCredentialsError('Supervisor credentials are invalid.');
    }

    if (approver.failedAttempts > 0 || unlocked) {
      approver.resetFailedAttempts(now);
      await this.deps.userRepo.save(approver);
    }

    const allRoles = await this.deps.roleRepo.listAll();
    const rolesById = new Map(allRoles.map((r) => [r.id, r]));

    const decision = this.evaluator.assertSupervisorOverride({
      requesterId: input.requesterId,
      approver,
      rolesById,
      permission: input.permission,
      scope: input.scope,
      now,
      features: this.deps.features,
    });

    await this.deps.publishEvent?.({
      type: 'SupervisorOverrideAuthorized',
      requesterId: input.requesterId,
      approverId: approver.id,
      permission: decision.permission,
      scope: input.scope,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'SUPERVISOR_OVERRIDE',
        actorId: approver.id,
        targetUserId: input.requesterId,
        permission: decision.permission,
        scope: input.scope,
        outcome: 'ALLOW',
        occurredAt: now.toISOString(),
      });
    }

    return {
      approverId: approver.id,
      decision,
    };
  }

  private async findApprover(identifier: string, method: 'PIN' | 'PASSWORD'): Promise<AuthUser | null> {
    if (method === 'PIN') {
      const byId = await this.deps.userRepo.findById(identifier);
      if (byId) return byId;
      return this.deps.userRepo.findByUsername(identifier);
    }
    if (identifier.includes('@')) {
      const byEmail = await this.deps.userRepo.findByEmail(identifier);
      if (byEmail) return byEmail;
    }
    const byId = await this.deps.userRepo.findById(identifier);
    if (byId) return byId;
    return this.deps.userRepo.findByUsername(identifier);
  }
}
