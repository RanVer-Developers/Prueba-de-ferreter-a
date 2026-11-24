import { z } from 'zod';
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
import { AuthSession } from '../domain/entities/session.js';
import { AuthUser, LockoutPolicy } from '../domain/entities/user.js';
import {
  AccessDeniedError,
  AccountLockedError,
  InvalidCredentialsError,
  SelfApprovalNotAllowedError,
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
import {
  AuthorizationDecision,
  RbacEvaluatorService,
} from '../domain/services/rbac-evaluator.service.js';
import { normalizeScope, scopeMatches } from '../domain/value-objects/permission.js';
import {
  AUTH_RBAC_SCHEMA_VERSION,
  NonEmptyIdSchema,
  PermissionSchema,
  Scope,
  ScopeSchema,
  parseWithAuthSchema,
} from '../schemas/auth-rbac.schemas.js';

const AuthorizeActionInputSchema = z.object({
  userId: NonEmptyIdSchema,
  permission: PermissionSchema,
  scope: ScopeSchema.optional(),
});

const SupervisorOverrideInputSchema = z.object({
  requesterId: NonEmptyIdSchema,
  approverIdentifier: z.string().trim().min(1, 'Approver identifier is required.'),
  approverSecret: z.string().min(1, 'Approver secret is required.'),
  authMethod: z.enum(['PIN', 'PASSWORD']).default('PIN'),
  permission: PermissionSchema,
  scope: ScopeSchema.optional(),
});

export interface AuthorizeActionInput {
  userId: string;
  permission: string;
  scope?: Scope;
  session?: AuthSession;
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
  features?: AuthRbacFeatureProfile;
}

export class AuthorizeActionUseCase {
  private readonly clock: IClock;
  private readonly evaluator: RbacEvaluatorService;
  private readonly lockoutPolicy: LockoutPolicy;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: AuthorizeActionDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.evaluator = deps.evaluator ?? new RbacEvaluatorService();
    this.lockoutPolicy = deps.lockoutPolicy ?? DEFAULT_LOCKOUT_POLICY;
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async evaluate(rawInput: AuthorizeActionInput): Promise<AuthorizationDecision> {
    const input = parseWithAuthSchema(AuthorizeActionInputSchema, rawInput, 'authorize action input');
    const requestedScope = normalizeScope(input.scope);
    if (requestedScope) {
      assertAuthRbacFeatureEnabled(this.features, 'scopedRoles');
    }

    const now = this.clock.now();
    if (rawInput.session) {
      rawInput.session.assertActive(now);
      if (!scopeMatches(rawInput.session.scope, requestedScope)) {
        return {
          allowed: false,
          permission: input.permission,
          reason: 'MISSING_PERMISSION',
          effectiveRoleIds: [],
        };
      }
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
      scope: requestedScope,
      now,
      features: this.features,
    });
  }

  public async assert(rawInput: AuthorizeActionInput): Promise<AuthorizationDecision> {
    const input = parseWithAuthSchema(AuthorizeActionInputSchema, rawInput, 'authorize action input');
    const requestedScope = normalizeScope(input.scope);
    if (requestedScope) {
      assertAuthRbacFeatureEnabled(this.features, 'scopedRoles');
    }

    const now = this.clock.now();
    if (rawInput.session) {
      rawInput.session.assertActive(now);
      if (!scopeMatches(rawInput.session.scope, requestedScope)) {
        throw new AccessDeniedError(input.permission, 'Session scope does not cover requested scope.');
      }
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
      scope: requestedScope,
      now,
      features: this.features,
    });
  }

  public async authorizeSupervisorOverride(
    rawInput: SupervisorOverrideInput
  ): Promise<{ approverId: string; decision: AuthorizationDecision }> {
    assertAuthRbacFeatureEnabled(this.features, 'supervisorOverride');
    const input = parseWithAuthSchema(
      SupervisorOverrideInputSchema,
      rawInput,
      'supervisor override input'
    );
    const method = input.authMethod;
    if (method === 'PIN') {
      assertAuthRbacFeatureEnabled(this.features, 'pinAuth');
    }
    const requestedScope = normalizeScope(input.scope);
    if (requestedScope) {
      assertAuthRbacFeatureEnabled(this.features, 'scopedRoles');
    }

    if (!this.deps.passwordHasher) {
      throw new InvalidCredentialsError('Password/PIN verification adapter is required for supervisor override.');
    }

    const now = this.clock.now();
    const approver = await this.findApprover(input.approverIdentifier, method);
    if (!approver) {
      await this.recordOverrideFailure(input.requesterId, undefined, method, input.permission, requestedScope, 'Approver not found', now);
      throw new InvalidCredentialsError('Supervisor credentials are invalid.');
    }

    if (approver.id === input.requesterId) {
      await this.recordOverrideFailure(input.requesterId, approver.id, method, input.permission, requestedScope, 'Self approval attempted', now);
      throw new SelfApprovalNotAllowedError(approver.id, input.permission);
    }

    if (approver.isLockedAt(now)) {
      await this.recordOverrideFailure(input.requesterId, approver.id, method, input.permission, requestedScope, 'Approver account locked', now);
      throw new AccountLockedError(approver.id, approver.lockedUntil);
    }
    const unlocked = approver.unlockIfExpired(now);
    const storedHash = method === 'PIN' ? approver.pinHash : approver.passwordHash;
    const validSecret = storedHash
      ? await this.deps.passwordHasher.verify(input.approverSecret, storedHash)
      : false;

    if (!validSecret) {
      if (approver.status !== 'ACTIVE') {
        await this.recordOverrideFailure(input.requesterId, approver.id, method, input.permission, requestedScope, `Approver status ${approver.status}`, now);
        throw new InvalidCredentialsError('Supervisor credentials are invalid.');
      }
      const useBruteForce = isAuthRbacFeatureEnabled(this.features, 'bruteForceProtection');
      const becameLocked = useBruteForce
        ? approver.recordFailedAttempt(now, this.lockoutPolicy)
        : false;
      if (useBruteForce || unlocked) {
        await this.deps.userRepo.save(approver);
      }
      await this.recordOverrideFailure(
        input.requesterId,
        approver.id,
        method,
        input.permission,
        requestedScope,
        'Invalid supervisor secret',
        now,
        approver.failedAttempts
      );
      if (becameLocked) {
        await this.deps.publishEvent?.({
          type: 'UserLocked',
          userId: approver.id,
          lockedUntil: approver.lockedUntil,
          failedAttempts: approver.failedAttempts,
          occurredAt: now.toISOString(),
        });
        throw new AccountLockedError(approver.id, approver.lockedUntil);
      }
      throw new InvalidCredentialsError('Supervisor credentials are invalid.');
    }

    if (approver.status !== 'ACTIVE') {
      await this.recordOverrideFailure(input.requesterId, approver.id, method, input.permission, requestedScope, `Approver status ${approver.status}`, now);
      throw new UserNotActiveError(approver.id, approver.status);
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
      scope: requestedScope,
      now,
      features: this.features,
    });

    await this.deps.publishEvent?.({
      type: 'SupervisorOverrideAuthorized',
      requesterId: input.requesterId,
      approverId: approver.id,
      permission: decision.permission,
      scope: requestedScope,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'SUPERVISOR_OVERRIDE',
        actorId: approver.id,
        targetUserId: input.requesterId,
        permission: decision.permission,
        scope: requestedScope,
        outcome: 'ALLOW',
        occurredAt: now.toISOString(),
      });
    }

    return {
      approverId: approver.id,
      decision,
    };
  }

  private async recordOverrideFailure(
    requesterId: string,
    approverId: string | undefined,
    method: 'PIN' | 'PASSWORD',
    permission: string,
    scope: Scope | undefined,
    reason: string,
    now: Date,
    failedAttempts?: number
  ): Promise<void> {
    await this.deps.publishEvent?.({
      type: 'AuthenticationFailed',
      identifier: approverId ?? requesterId,
      userId: approverId,
      method,
      reason,
      failedAttempts,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'SUPERVISOR_OVERRIDE',
        actorId: approverId,
        targetUserId: requesterId,
        permission,
        scope,
        outcome: 'DENY',
        reason,
        occurredAt: now.toISOString(),
      });
    }
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
