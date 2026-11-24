import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AuthUser,
  AuthenticateUserUseCase,
  AuthorizeActionUseCase,
  ChangeCredentialsUseCase,
  ConcurrencyError,
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InvalidAuthInputError,
  ManageRoleUseCase,
  RbacEvaluatorService,
  RefreshSessionUseCase,
  RegisterUserUseCase,
  RevokeSessionUseCase,
  Role,
  ScopeSchema,
  resolveAuthRbacFeatures,
  scopeMatches,
} from '../src/index.js';
import { ManualClock, TestPasswordHasher, TestTokenGenerator } from './test-helpers.js';

describe('@modulos/core-auth-rbac: Audit security hardening', () => {
  it('prevents cross-tenant directPermissions bypass and branch-without-tenant scopes', () => {
    const evaluator = new RbacEvaluatorService();
    const role = Role.create({
      id: 'r-t1',
      code: 'T1_CASHIER',
      name: 'Tenant 1 Cashier',
      permissions: ['orders:read'],
    });
    const user = AuthUser.create({
      id: 'u-1',
      username: 'user1',
      displayName: 'User 1',
      passwordHash: 'hashed:Pass1234',
      assignments: [
        { roleId: 'r-t1', scope: { tenantId: 't1', branchId: 'b1' }, assignedAt: new Date().toISOString() },
      ],
      directPermissions: {
        allow: ['cashier:void'],
        deny: [],
      },
    });
    const rolesById = new Map([[role.id, role]]);

    // Direct permission without scope must not grant access when evaluating a tenant scope
    const crossTenant = evaluator.evaluatePermission({
      user,
      rolesById,
      permission: 'cashier:void',
      scope: { tenantId: 't2', branchId: 'b1' },
    });
    expect(crossTenant.allowed).toBe(false);

    // Branch without tenant is rejected by ScopeSchema and scopeMatches
    expect(ScopeSchema.safeParse({ branchId: 'b1' }).success).toBe(false);
    expect(scopeMatches({ branchId: 'b1' }, { tenantId: 't2', branchId: 'b1' })).toBe(false);
  });

  it('rejects scoped login when user has no assignment covering the requested scope', async () => {
    const clock = new ManualClock();
    const userRepo = new InMemoryUserRepository();
    const roleRepo = new InMemoryRoleRepository();
    const sessionRepo = new InMemorySessionRepository();
    const auditRepo = new InMemoryAuditRepository();
    const hasher = new TestPasswordHasher();
    const tokens = new TestTokenGenerator();
    const features = resolveAuthRbacFeatures('ADVANCED');

    await new ManageRoleUseCase({ roleRepo, clock, features }).createRole({
      id: 'r-1',
      code: 'CASHIER',
      name: 'Cashier',
      permissions: ['orders:create'],
    });

    await new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: hasher,
      clock,
      features,
    }).execute({
      id: 'u-t1',
      username: 't1user',
      displayName: 'T1 User',
      password: 'Password123',
      initialRoles: [{ roleId: 'r-1', scope: { tenantId: 't1' } }],
    });

    const auth = new AuthenticateUserUseCase({
      userRepo,
      passwordHasher: hasher,
      sessionRepo,
      tokenGenerator: tokens,
      auditRepo,
      clock,
      features,
    });

    await expect(
      auth.execute({
        identifier: 't1user',
        secret: 'Password123',
        scope: { tenantId: 't2' },
      })
    ).rejects.toThrow(AccessDeniedError);
  });

  it('audits supervisor override failures, enforces session concurrency on refresh, and hardens credentials', async () => {
    const clock = new ManualClock();
    const userRepo = new InMemoryUserRepository();
    const roleRepo = new InMemoryRoleRepository();
    const sessionRepo = new InMemorySessionRepository();
    const auditRepo = new InMemoryAuditRepository();
    const hasher = new TestPasswordHasher();
    const tokens = new TestTokenGenerator();
    const features = resolveAuthRbacFeatures('ADVANCED');

    await new ManageRoleUseCase({ roleRepo, clock, features }).createRole({
      id: 'r-sup',
      code: 'SUP',
      name: 'Supervisor',
      permissions: ['cashier:void'],
    });

    const register = new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: hasher,
      clock,
      features,
    });

    await register.execute({
      id: 'u-sup',
      username: 'sup',
      displayName: 'Supervisor',
      password: 'Password123',
      pin: '4829',
      initialRoles: [{ roleId: 'r-sup' }],
    });

    const authorize = new AuthorizeActionUseCase({
      userRepo,
      roleRepo,
      passwordHasher: hasher,
      auditRepo,
      clock,
      features,
    });

    await expect(
      authorize.authorizeSupervisorOverride({
        requesterId: 'u-cashier',
        approverIdentifier: 'sup',
        approverSecret: '9999',
        permission: 'cashier:void',
      })
    ).rejects.toThrow();

    const entries = auditRepo.listAll();
    expect(entries.some((e) => e.action === 'SUPERVISOR_OVERRIDE' && e.outcome === 'DENY')).toBe(true);

    // Mutating returned audit list does not corrupt repository
    (entries as unknown as Array<unknown>).length = 0;
    expect(auditRepo.listAll().length).toBeGreaterThan(0);

    // skipCurrentCheck requires a distinct actorId
    const changeCreds = new ChangeCredentialsUseCase({
      userRepo,
      passwordHasher: hasher,
      sessionRepo,
      auditRepo,
      clock,
      features,
    });
    await expect(
      changeCreds.changePassword({
        userId: 'u-sup',
        newPassword: 'NewPassword123',
        skipCurrentCheck: true,
      })
    ).rejects.toThrow(AccessDeniedError);

    // Trivial repeated PIN is rejected
    await expect(
      changeCreds.changePin({ userId: 'u-sup', currentPin: '4829', newPin: '1111' })
    ).rejects.toThrow(InvalidAuthInputError);

    // Optimistic concurrency on AuthSession refresh
    const auth = new AuthenticateUserUseCase({
      userRepo,
      passwordHasher: hasher,
      sessionRepo,
      tokenGenerator: tokens,
      clock,
      features,
    });
    const login = await auth.execute({ identifier: 'sup', secret: 'Password123' });
    const sessionCopy = (await sessionRepo.findById(login.session!.id))!;
    const refresh = new RefreshSessionUseCase({
      sessionRepo,
      userRepo,
      tokenGenerator: tokens,
      auditRepo,
      clock,
      features,
    });
    await refresh.execute({ refreshToken: login.refreshToken! });
    // Saving stale sessionCopy throws ConcurrencyError
    sessionCopy.touch(clock.now());
    await expect(sessionRepo.save(sessionCopy)).rejects.toThrow(ConcurrencyError);

    // Idempotent revokeOne does not throw or duplicate audit
    const revoke = new RevokeSessionUseCase({ sessionRepo, userRepo, auditRepo, clock, features });
    const beforeCount = auditRepo.listAll().length;
    await revoke.revokeOne(login.session!.id, 'Logout', 'admin-1');
    await revoke.revokeOne(login.session!.id, 'Logout', 'admin-1');
    expect(auditRepo.listAll().length).toBe(beforeCount + 1);
  });
});
