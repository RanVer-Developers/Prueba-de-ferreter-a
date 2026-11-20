import { z } from 'zod';
import {
  AuthEventPublisher,
  IAuditRepository,
  IClock,
  IIdGenerator,
  IRoleRepository,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { Role } from '../domain/entities/role.js';
import { DuplicateRoleError, RoleNotFoundError } from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
} from '../domain/services/auth-features.js';
import { assertNoRoleInheritanceCycle } from '../domain/services/rbac-evaluator.service.js';
import {
  AUTH_RBAC_SCHEMA_VERSION,
  NonEmptyIdSchema,
  PermissionSchema,
  RoleCodeSchema,
  parseWithAuthSchema,
} from '../schemas/auth-rbac.schemas.js';

const CreateRoleInputSchema = z.object({
  id: NonEmptyIdSchema,
  code: RoleCodeSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  permissions: z.array(PermissionSchema).default([]),
  deniedPermissions: z.array(PermissionSchema).default([]),
  inheritsFrom: z.array(NonEmptyIdSchema).default([]),
  isSystem: z.boolean().default(false),
  actorId: NonEmptyIdSchema.optional(),
});

const UpdateRoleInputSchema = z.object({
  roleId: NonEmptyIdSchema,
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  permissions: z.array(PermissionSchema).optional(),
  deniedPermissions: z.array(PermissionSchema).optional(),
  inheritsFrom: z.array(NonEmptyIdSchema).optional(),
  actorId: NonEmptyIdSchema.optional(),
});

export interface CreateRoleInput {
  id: string;
  code: string;
  name: string;
  description?: string;
  permissions?: string[];
  deniedPermissions?: string[];
  inheritsFrom?: string[];
  isSystem?: boolean;
  actorId?: string;
}

export interface UpdateRoleInput {
  roleId: string;
  name?: string;
  description?: string;
  permissions?: string[];
  deniedPermissions?: string[];
  inheritsFrom?: string[];
  actorId?: string;
}

export interface ManageRoleDeps {
  roleRepo: IRoleRepository;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  features?: AuthRbacFeatureFlags;
}

export class ManageRoleUseCase {
  private readonly clock: IClock;

  constructor(private readonly deps: ManageRoleDeps) {
    this.clock = deps.clock ?? SystemClock;
  }

  public async createRole(rawInput: CreateRoleInput): Promise<Role> {
    const input = parseWithAuthSchema(CreateRoleInputSchema, rawInput, 'create role input');
    const now = this.clock.now();

    if (input.deniedPermissions.length > 0) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'explicitDeny');
    }
    if (input.inheritsFrom.length > 0) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'roleInheritance');
    }

    if (await this.deps.roleRepo.findById(input.id)) {
      throw new DuplicateRoleError('id', input.id);
    }
    if (await this.deps.roleRepo.findByCode(input.code)) {
      throw new DuplicateRoleError('code', input.code);
    }

    if (input.inheritsFrom.length > 0) {
      const rolesById = await this.loadRoleMap();
      for (const parentId of input.inheritsFrom) {
        if (!rolesById.has(parentId)) {
          throw new RoleNotFoundError(parentId);
        }
      }
      assertNoRoleInheritanceCycle(input.id, input.inheritsFrom, rolesById);
    }

    const role = Role.create({
      id: input.id,
      code: input.code,
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      deniedPermissions: input.deniedPermissions,
      inheritsFrom: input.inheritsFrom,
      isSystem: input.isSystem,
      now,
    });

    await this.deps.roleRepo.save(role);

    await this.deps.publishEvent?.({
      type: 'RoleSaved',
      roleId: role.id,
      code: role.code,
      occurredAt: now.toISOString(),
    });

    await this.recordAudit('ROLE_CREATED', input.actorId, now);
    return role;
  }

  public async updateRole(rawInput: UpdateRoleInput): Promise<Role> {
    const input = parseWithAuthSchema(UpdateRoleInputSchema, rawInput, 'update role input');
    const now = this.clock.now();

    const role = await this.deps.roleRepo.findById(input.roleId);
    if (!role) {
      throw new RoleNotFoundError(input.roleId);
    }

    if (input.deniedPermissions !== undefined && input.deniedPermissions.length > 0) {
      assertAuthRbacFeatureEnabled(this.deps.features, 'explicitDeny');
    }

    if (input.inheritsFrom !== undefined) {
      if (input.inheritsFrom.length > 0) {
        assertAuthRbacFeatureEnabled(this.deps.features, 'roleInheritance');
      }
      const rolesById = await this.loadRoleMap();
      for (const parentId of input.inheritsFrom) {
        if (!rolesById.has(parentId)) {
          throw new RoleNotFoundError(parentId);
        }
      }
      assertNoRoleInheritanceCycle(role.id, input.inheritsFrom, rolesById);
      role.setInheritance(input.inheritsFrom, now);
    }

    if (input.name !== undefined || input.description !== undefined) {
      role.updateDetails({ name: input.name, description: input.description }, now);
    }

    if (input.permissions !== undefined || input.deniedPermissions !== undefined) {
      role.setPermissions(
        input.permissions ?? role.permissions,
        input.deniedPermissions ?? role.deniedPermissions,
        now
      );
    }

    await this.deps.roleRepo.save(role);

    await this.deps.publishEvent?.({
      type: 'RoleSaved',
      roleId: role.id,
      code: role.code,
      occurredAt: now.toISOString(),
    });

    await this.recordAudit('ROLE_UPDATED', input.actorId, now);
    return role;
  }

  public async deleteRole(roleId: string, actorId?: string): Promise<void> {
    const now = this.clock.now();
    const role = await this.deps.roleRepo.findById(roleId);
    if (!role) {
      throw new RoleNotFoundError(roleId);
    }
    role.assertDeletable();
    await this.deps.roleRepo.delete(role.id);
    await this.recordAudit('ROLE_DELETED', actorId, now);
  }

  private async loadRoleMap(): Promise<Map<string, Role>> {
    const allRoles = await this.deps.roleRepo.listAll();
    return new Map(allRoles.map((r) => [r.id, r]));
  }

  private async recordAudit(action: string, actorId: string | undefined, now: Date): Promise<void> {
    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action,
        actorId,
        outcome: 'SUCCESS',
        occurredAt: now.toISOString(),
      });
    }
  }
}
