import { z } from 'zod';
import {
  AuthEventPublisher,
  IAuditRepository,
  IClock,
  IIdGenerator,
  IRoleRepository,
  IUserRepository,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { AuthUserPublicSummary } from '../domain/entities/user.js';
import { RoleNotFoundError, UserNotFoundError } from '../domain/errors/auth-rbac-errors.js';
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

const AssignRoleInputSchema = z.object({
  userId: NonEmptyIdSchema,
  roleId: NonEmptyIdSchema,
  scope: ScopeSchema.optional(),
  actorId: NonEmptyIdSchema.optional(),
});

export interface AssignUserRoleInput {
  userId: string;
  roleId: string;
  scope?: Scope;
  actorId?: string;
}

export interface AssignUserRoleDeps {
  userRepo: IUserRepository;
  roleRepo: IRoleRepository;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  features?: AuthRbacFeatureFlags;
}

export class AssignUserRoleUseCase {
  private readonly clock: IClock;

  constructor(private readonly deps: AssignUserRoleDeps) {
    this.clock = deps.clock ?? SystemClock;
  }

  public async assignRole(rawInput: AssignUserRoleInput): Promise<AuthUserPublicSummary> {
    const input = parseWithAuthSchema(AssignRoleInputSchema, rawInput, 'assign role input');
    const now = this.clock.now();

    if (input.scope && (input.scope.tenantId || input.scope.branchId)) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'scopedRoles');
    }

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    const role = await this.deps.roleRepo.findById(input.roleId);
    if (!role) {
      throw new RoleNotFoundError(input.roleId);
    }

    const added = user.assignRole(role.id, input.scope, now, input.actorId);
    if (added) {
      await this.deps.userRepo.save(user);
      await this.deps.publishEvent?.({
        type: 'UserRoleAssigned',
        userId: user.id,
        roleId: role.id,
        scope: input.scope,
        assignedBy: input.actorId,
        occurredAt: now.toISOString(),
      });

      if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
        await this.deps.auditRepo.append({
          schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
          id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
          action: 'USER_ROLE_ASSIGNED',
          actorId: input.actorId,
          targetUserId: user.id,
          scope: input.scope,
          outcome: 'SUCCESS',
          occurredAt: now.toISOString(),
        });
      }
    }

    return user.toPublicSummary();
  }

  public async revokeRole(rawInput: AssignUserRoleInput): Promise<AuthUserPublicSummary> {
    const input = parseWithAuthSchema(AssignRoleInputSchema, rawInput, 'revoke role input');
    const now = this.clock.now();

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    const removed = user.revokeRole(input.roleId, input.scope, now);
    if (removed) {
      // Bump tokenVersion so sessions holding revoked privileges are invalidated immediately.
      user.bumpTokenVersion(now);
      await this.deps.userRepo.save(user);

      await this.deps.publishEvent?.({
        type: 'UserRoleRevoked',
        userId: user.id,
        roleId: input.roleId,
        scope: input.scope,
        occurredAt: now.toISOString(),
      });

      if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
        await this.deps.auditRepo.append({
          schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
          id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
          action: 'USER_ROLE_REVOKED',
          actorId: input.actorId,
          targetUserId: user.id,
          scope: input.scope,
          outcome: 'SUCCESS',
          occurredAt: now.toISOString(),
        });
      }
    }

    return user.toPublicSummary();
  }
}
