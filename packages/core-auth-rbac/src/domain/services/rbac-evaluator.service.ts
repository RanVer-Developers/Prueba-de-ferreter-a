import { Role } from '../entities/role.js';
import { AuthUser } from '../entities/user.js';
import {
  AccessDeniedError,
  AccountLockedError,
  CyclicRoleInheritanceError,
  SelfApprovalNotAllowedError,
  UserNotActiveError,
} from '../errors/auth-rbac-errors.js';
import { Permission, Scope } from '../../schemas/auth-rbac.schemas.js';
import {
  AuthRbacFeatureFlags,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
} from './auth-features.js';
import {
  hasMatchingPermission,
  normalizePermission,
  scopeMatches,
} from '../value-objects/permission.js';

export type AuthorizationDenialReason =
  | 'ACCOUNT_LOCKED'
  | 'USER_NOT_ACTIVE'
  | 'EXPLICIT_DENY'
  | 'MISSING_PERMISSION';

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly permission: Permission;
  readonly reason: 'GRANTED' | AuthorizationDenialReason;
  readonly matchedPermission?: string;
  readonly effectiveRoleIds: ReadonlyArray<string>;
}

export interface EvaluatePermissionInput {
  user: AuthUser;
  rolesById: ReadonlyMap<string, Role>;
  permission: string;
  scope?: Scope;
  now?: Date;
  features?: AuthRbacFeatureFlags;
}

export interface EvaluateSupervisorOverrideInput {
  requesterId: string;
  approver: AuthUser;
  rolesById: ReadonlyMap<string, Role>;
  permission: string;
  scope?: Scope;
  now?: Date;
  features?: AuthRbacFeatureFlags;
}

/**
 * Validates that adding/updating `inheritsFrom` on `roleId` does not introduce any cycle.
 */
export function assertNoRoleInheritanceCycle(
  roleId: string,
  parentRoleIds: ReadonlyArray<string>,
  rolesById: ReadonlyMap<string, Role>
): void {
  const visiting = new Set<string>([roleId]);
  const visited = new Set<string>();

  const dfs = (currentId: string): void => {
    if (visiting.has(currentId)) {
      throw new CyclicRoleInheritanceError(roleId, currentId);
    }
    if (visited.has(currentId)) {
      return;
    }
    visiting.add(currentId);
    const role = rolesById.get(currentId);
    if (role) {
      for (const parentId of role.inheritsFrom) {
        dfs(parentId);
      }
    }
    visiting.delete(currentId);
    visited.add(currentId);
  };

  for (const parentId of parentRoleIds) {
    dfs(parentId);
  }
}

export class RbacEvaluatorService {
  /**
   * Resolves all effective roles for a user within `scope`, traversing inheritance if enabled.
   */
  public resolveEffectiveRoles(
    user: AuthUser,
    rolesById: ReadonlyMap<string, Role>,
    scope?: Scope,
    features?: AuthRbacFeatureFlags
  ): Role[] {
    const useScopes = isAuthRbacFeatureEnabled(features, 'scopedRoles');
    const useInheritance = isAuthRbacFeatureEnabled(features, 'roleInheritance');

    const rootRoleIds: string[] = [];
    for (const assignment of user.assignments) {
      if (!useScopes || scopeMatches(assignment.scope, scope)) {
        rootRoleIds.push(assignment.roleId);
      }
    }

    const resolved: Role[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (roleId: string): void => {
      if (visiting.has(roleId)) {
        throw new CyclicRoleInheritanceError(roleId, roleId);
      }
      if (visited.has(roleId)) {
        return;
      }
      const role = rolesById.get(roleId);
      if (!role) {
        return;
      }
      visiting.add(roleId);
      if (useInheritance) {
        for (const parentId of role.inheritsFrom) {
          visit(parentId);
        }
      }
      visiting.delete(roleId);
      visited.add(roleId);
      resolved.push(role);
    };

    for (const roleId of rootRoleIds) {
      visit(roleId);
    }

    return resolved;
  }

  public evaluatePermission(input: EvaluatePermissionInput): AuthorizationDecision {
    const now = input.now ?? new Date();
    const required = normalizePermission(input.permission);
    const useGranular = isAuthRbacFeatureEnabled(input.features, 'granularPermissions');
    const useExplicitDeny = isAuthRbacFeatureEnabled(input.features, 'explicitDeny');

    if (input.user.isLockedAt(now)) {
      return {
        allowed: false,
        permission: required,
        reason: 'ACCOUNT_LOCKED',
        effectiveRoleIds: [],
      };
    }

    // If a temporary lock has expired, treat user as active for read evaluation unless status is non-ACTIVE.
    const lockExpired =
      input.user.status === 'LOCKED' &&
      input.user.lockedUntil !== undefined &&
      new Date(input.user.lockedUntil).getTime() <= now.getTime();

    if (input.user.status !== 'ACTIVE' && !lockExpired) {
      return {
        allowed: false,
        permission: required,
        reason: 'USER_NOT_ACTIVE',
        effectiveRoleIds: [],
      };
    }

    const effectiveRoles = this.resolveEffectiveRoles(
      input.user,
      input.rolesById,
      input.scope,
      input.features
    );
    const effectiveRoleIds = effectiveRoles.map((r) => r.id);

    const allowPool: string[] = [];
    const denyPool: string[] = [];

    for (const role of effectiveRoles) {
      for (const perm of role.permissions) {
        allowPool.push(perm);
      }
      if (useExplicitDeny) {
        for (const denied of role.deniedPermissions) {
          denyPool.push(denied);
        }
      }
    }

    if (useGranular) {
      for (const perm of input.user.directPermissions.allow) {
        allowPool.push(perm);
      }
      if (useExplicitDeny) {
        for (const denied of input.user.directPermissions.deny) {
          denyPool.push(denied);
        }
      }
    }

    if (useExplicitDeny) {
      const deniedMatch = useGranular
        ? hasMatchingPermission(denyPool, required)
        : denyPool.find((p) => p === required);
      if (deniedMatch) {
        return {
          allowed: false,
          permission: required,
          reason: 'EXPLICIT_DENY',
          matchedPermission: deniedMatch,
          effectiveRoleIds,
        };
      }
    }

    const allowedMatch = useGranular
      ? hasMatchingPermission(allowPool, required)
      : allowPool.find((p) => p === required || p === '*:*' || p === '*');

    if (allowedMatch) {
      return {
        allowed: true,
        permission: required,
        reason: 'GRANTED',
        matchedPermission: allowedMatch,
        effectiveRoleIds,
      };
    }

    return {
      allowed: false,
      permission: required,
      reason: 'MISSING_PERMISSION',
      effectiveRoleIds,
    };
  }

  public assertPermission(input: EvaluatePermissionInput): AuthorizationDecision {
    const decision = this.evaluatePermission(input);
    if (decision.allowed) {
      return decision;
    }

    if (decision.reason === 'ACCOUNT_LOCKED') {
      throw new AccountLockedError(input.user.id, input.user.lockedUntil);
    }
    if (decision.reason === 'USER_NOT_ACTIVE') {
      throw new UserNotActiveError(input.user.id, input.user.status);
    }
    const reasonText =
      decision.reason === 'EXPLICIT_DENY'
        ? `Explicitly denied by rule '${decision.matchedPermission}'.`
        : 'User does not hold the required permission in this scope.';
    throw new AccessDeniedError(decision.permission, reasonText);
  }

  public assertSupervisorOverride(input: EvaluateSupervisorOverrideInput): AuthorizationDecision {
    assertAuthRbacFeatureEnabled(input.features, 'supervisorOverride');
    const required = normalizePermission(input.permission);

    if (input.approver.id === input.requesterId) {
      throw new SelfApprovalNotAllowedError(input.approver.id, required);
    }

    return this.assertPermission({
      user: input.approver,
      rolesById: input.rolesById,
      permission: required,
      scope: input.scope,
      now: input.now,
      features: input.features,
    });
  }
}
