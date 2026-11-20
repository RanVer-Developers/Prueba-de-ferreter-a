import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AccountLockedError,
  AuthUser,
  CyclicRoleInheritanceError,
  FeatureDisabledError,
  InvalidAuthInputError,
  RbacEvaluatorService,
  Role,
  UserNotActiveError,
  matchesPermission,
  resolveAuthRbacFeatures,
  scopeMatches,
} from '../src/index.js';

describe('Permission matching, scopes, and RBAC evaluation', () => {
  const evaluator = new RbacEvaluatorService();

  it('matches exact, wildcard resource, sub-resource, and superadmin permissions', () => {
    expect(matchesPermission('orders:create', 'orders:create')).toBe(true);
    expect(matchesPermission('orders:create', 'orders:delete')).toBe(false);
    expect(matchesPermission('orders:*', 'orders:create')).toBe(true);
    expect(matchesPermission('orders:*', 'orders:discount:apply')).toBe(true);
    expect(matchesPermission('orders:discount:*', 'orders:discount:apply')).toBe(true);
    expect(matchesPermission('orders:discount:*', 'orders:create')).toBe(false);
    expect(matchesPermission('*:*', 'billing:invoice:issue')).toBe(true);
    expect(matchesPermission('*', 'cashier:shift:close')).toBe(true);
  });

  it('evaluates hierarchical scopes (global, tenant, tenant+branch)', () => {
    expect(scopeMatches(undefined, { tenantId: 't1', branchId: 'b1' })).toBe(true);
    expect(scopeMatches({ tenantId: 't1' }, { tenantId: 't1', branchId: 'b1' })).toBe(true);
    expect(scopeMatches({ tenantId: 't1' }, { tenantId: 't2', branchId: 'b1' })).toBe(false);
    expect(scopeMatches({ tenantId: 't1' }, undefined)).toBe(false);
    expect(
      scopeMatches({ tenantId: 't1', branchId: 'b1' }, { tenantId: 't1', branchId: 'b1' })
    ).toBe(true);
    expect(
      scopeMatches({ tenantId: 't1', branchId: 'b1' }, { tenantId: 't1', branchId: 'b2' })
    ).toBe(false);
  });

  it('enforces explicit deny precedence over role allow and direct allow', () => {
    const managerRole = Role.create({
      id: 'role-manager',
      code: 'MANAGER',
      name: 'Store Manager',
      permissions: ['orders:*', 'cashier:*'],
      deniedPermissions: ['cashier:void'],
    });
    const user = AuthUser.create({
      id: 'u-1',
      username: 'laura',
      displayName: 'Laura',
      passwordHash: 'hashed:secret123',
      assignments: [{ roleId: 'role-manager', assignedAt: new Date().toISOString() }],
      directPermissions: {
        allow: ['cashier:void'],
        deny: ['orders:delete'],
      },
    });
    const rolesById = new Map([[managerRole.id, managerRole]]);

    const allowCreate = evaluator.evaluatePermission({
      user,
      rolesById,
      permission: 'orders:create',
    });
    expect(allowCreate.allowed).toBe(true);

    const deniedByRole = evaluator.evaluatePermission({
      user,
      rolesById,
      permission: 'cashier:void',
    });
    expect(deniedByRole.allowed).toBe(false);
    expect(deniedByRole.reason).toBe('EXPLICIT_DENY');

    expect(() =>
      evaluator.assertPermission({ user, rolesById, permission: 'orders:delete' })
    ).toThrow(AccessDeniedError);
  });

  it('resolves role inheritance and detects cyclic inheritance graphs', () => {
    const baseRole = Role.create({
      id: 'r-cashier',
      code: 'CASHIER',
      name: 'Cashier',
      permissions: ['orders:create', 'cashier:sale'],
    });
    const supervisorRole = Role.create({
      id: 'r-supervisor',
      code: 'SUPERVISOR',
      name: 'Supervisor',
      permissions: ['cashier:void'],
      inheritsFrom: ['r-cashier'],
    });
    const user = AuthUser.create({
      id: 'u-sup',
      username: 'carlos',
      displayName: 'Carlos',
      passwordHash: 'hashed:secret123',
      assignments: [{ roleId: 'r-supervisor', assignedAt: new Date().toISOString() }],
    });

    const rolesById = new Map([
      [baseRole.id, baseRole],
      [supervisorRole.id, supervisorRole],
    ]);

    expect(
      evaluator.evaluatePermission({ user, rolesById, permission: 'orders:create' }).allowed
    ).toBe(true);
    expect(
      evaluator.evaluatePermission({ user, rolesById, permission: 'cashier:void' }).allowed
    ).toBe(true);

    // Introduce a cycle r-cashier -> r-supervisor -> r-cashier
    baseRole.setInheritance(['r-supervisor']);
    expect(() =>
      evaluator.evaluatePermission({ user, rolesById, permission: 'orders:create' })
    ).toThrow(CyclicRoleInheritanceError);
  });

  it('respects AuthRbacTier BASIC vs ADVANCED feature flags', () => {
    const basicFlags = resolveAuthRbacFeatures('BASIC');
    const role = Role.create({
      id: 'r-pos',
      code: 'POS_USER',
      name: 'POS User',
      permissions: ['orders:*', 'billing:read'],
      deniedPermissions: ['billing:read'],
    });
    const user = AuthUser.create({
      id: 'u-basic',
      username: 'pos1',
      displayName: 'POS 1',
      passwordHash: 'hashed:123456',
      assignments: [
        {
          roleId: 'r-pos',
          scope: { tenantId: 't1', branchId: 'b1' },
          assignedAt: new Date().toISOString(),
        },
      ],
      directPermissions: { allow: ['inventory:adjust'], deny: [] },
    });
    const rolesById = new Map([[role.id, role]]);

    // In BASIC: granular wildcards and directPermissions are disabled; exact permission matches.
    expect(
      evaluator.evaluatePermission({
        user,
        rolesById,
        permission: 'orders:create',
        features: basicFlags,
      }).allowed
    ).toBe(false);
    expect(
      evaluator.evaluatePermission({
        user,
        rolesById,
        permission: 'inventory:adjust',
        features: basicFlags,
      }).allowed
    ).toBe(false);
    // In BASIC: explicitDeny is disabled, so exact permission 'billing:read' is allowed.
    expect(
      evaluator.evaluatePermission({
        user,
        rolesById,
        permission: 'billing:read',
        features: basicFlags,
      }).allowed
    ).toBe(true);

    expect(() =>
      evaluator.assertSupervisorOverride({
        requesterId: 'u-other',
        approver: user,
        rolesById,
        permission: 'billing:read',
        features: basicFlags,
      })
    ).toThrow(FeatureDisabledError);
  });

  it('denies inactive or locked users and validates corrupted JSON snapshots with Zod', () => {
    const role = Role.create({
      id: 'r-admin',
      code: 'ADMIN',
      name: 'Admin',
      permissions: ['*:*'],
    });
    const user = AuthUser.create({
      id: 'u-locked',
      username: 'lockeduser',
      displayName: 'Locked User',
      passwordHash: 'hashed:secret123',
      assignments: [{ roleId: 'r-admin', assignedAt: new Date().toISOString() }],
    });
    const rolesById = new Map([[role.id, role]]);

    user.setStatus('SUSPENDED');
    expect(() =>
      evaluator.assertPermission({ user, rolesById, permission: 'orders:create' })
    ).toThrow(UserNotActiveError);

    user.setStatus('LOCKED');
    expect(() =>
      evaluator.assertPermission({ user, rolesById, permission: 'orders:create' })
    ).toThrow(AccountLockedError);

    expect(() =>
      AuthUser.fromJSON({
        schemaVersion: 99,
        id: '',
        username: 'x',
      })
    ).toThrow(InvalidAuthInputError);
  });
});
