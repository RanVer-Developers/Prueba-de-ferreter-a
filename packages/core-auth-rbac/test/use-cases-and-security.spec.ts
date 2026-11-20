import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AssignUserRoleUseCase,
  AuthRbacDomainEvent,
  AuthorizeActionUseCase,
  ConcurrencyError,
  CyclicRoleInheritanceError,
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  ManageRoleUseCase,
  RegisterUserUseCase,
  SelfApprovalNotAllowedError,
  SystemRoleImmutableError,
  VerifySessionUseCase,
  AuthenticateUserUseCase,
  SessionInvalidError,
  resolveAuthRbacFeatures,
} from '../src/index.js';
import { ManualClock, TestPasswordHasher, TestTokenGenerator } from './test-helpers.js';

describe('Authorization use cases, supervisor overrides, role management, and concurrency', () => {
  function setup() {
    const clock = new ManualClock('2026-11-17T14:00:00.000Z');
    const userRepo = new InMemoryUserRepository({ isolate: true });
    const roleRepo = new InMemoryRoleRepository({ isolate: true });
    const sessionRepo = new InMemorySessionRepository({ isolate: true });
    const auditRepo = new InMemoryAuditRepository();
    const passwordHasher = new TestPasswordHasher();
    const tokenGenerator = new TestTokenGenerator();
    const events: AuthRbacDomainEvent[] = [];
    const publishEvent = (e: AuthRbacDomainEvent) => {
      events.push(e);
    };
    const features = resolveAuthRbacFeatures('ADVANCED');

    return {
      clock,
      userRepo,
      roleRepo,
      sessionRepo,
      auditRepo,
      passwordHasher,
      tokenGenerator,
      events,
      publishEvent,
      features,
    };
  }

  it('authorizes scoped permissions and enforces supervisor override without self-approval', async () => {
    const ctx = setup();
    const manageRole = new ManageRoleUseCase({
      roleRepo: ctx.roleRepo,
      auditRepo: ctx.auditRepo,
      publishEvent: ctx.publishEvent,
      clock: ctx.clock,
      features: ctx.features,
    });

    await manageRole.createRole({
      id: 'role-cashier',
      code: 'CASHIER',
      name: 'Cashier',
      permissions: ['cashier:sale'],
      isSystem: true,
    });
    await manageRole.createRole({
      id: 'role-supervisor',
      code: 'SUPERVISOR',
      name: 'Supervisor',
      permissions: ['cashier:void', 'cashier:refund'],
      inheritsFrom: ['role-cashier'],
    });

    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });

    await register.execute({
      id: 'cashier-1',
      username: 'pedro',
      displayName: 'Pedro',
      password: 'password123',
      pin: '1111',
      initialRoles: [{ roleId: 'role-cashier', scope: { tenantId: 't1', branchId: 'b1' } }],
    });
    await register.execute({
      id: 'sup-1',
      username: 'elena',
      displayName: 'Elena',
      password: 'password123',
      pin: '9999',
      initialRoles: [{ roleId: 'role-supervisor', scope: { tenantId: 't1' } }],
    });

    const authorize = new AuthorizeActionUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      auditRepo: ctx.auditRepo,
      publishEvent: ctx.publishEvent,
      clock: ctx.clock,
      features: ctx.features,
    });

    // Cashier allowed in b1, denied in b2
    const allowedInB1 = await authorize.evaluate({
      userId: 'cashier-1',
      permission: 'cashier:sale',
      scope: { tenantId: 't1', branchId: 'b1' },
    });
    expect(allowedInB1.allowed).toBe(true);

    const deniedInB2 = await authorize.evaluate({
      userId: 'cashier-1',
      permission: 'cashier:sale',
      scope: { tenantId: 't1', branchId: 'b2' },
    });
    expect(deniedInB2.allowed).toBe(false);

    // Self-approval is forbidden even if approver had the permission.
    await expect(
      authorize.authorizeSupervisorOverride({
        requesterId: 'sup-1',
        approverIdentifier: 'elena',
        approverSecret: '9999',
        authMethod: 'PIN',
        permission: 'cashier:void',
        scope: { tenantId: 't1', branchId: 'b1' },
      })
    ).rejects.toThrow(SelfApprovalNotAllowedError);

    // Cashier trying to approve supervisor void fails with AccessDeniedError.
    await expect(
      authorize.authorizeSupervisorOverride({
        requesterId: 'other-user',
        approverIdentifier: 'pedro',
        approverSecret: '1111',
        authMethod: 'PIN',
        permission: 'cashier:void',
        scope: { tenantId: 't1', branchId: 'b1' },
      })
    ).rejects.toThrow(AccessDeniedError);

    // Valid supervisor with tenant-level role approves branch b1 void.
    const overrideResult = await authorize.authorizeSupervisorOverride({
      requesterId: 'cashier-1',
      approverIdentifier: 'elena',
      approverSecret: '9999',
      authMethod: 'PIN',
      permission: 'cashier:void',
      scope: { tenantId: 't1', branchId: 'b1' },
    });
    expect(overrideResult.approverId).toBe('sup-1');
    expect(overrideResult.decision.allowed).toBe(true);
    expect(ctx.events.some((e) => e.type === 'SupervisorOverrideAuthorized')).toBe(true);
  });

  it('prevents deleting system roles, prevents saving cyclic inheritance, and invalidates sessions when role is revoked', async () => {
    const ctx = setup();
    const manageRole = new ManageRoleUseCase({
      roleRepo: ctx.roleRepo,
      clock: ctx.clock,
      features: ctx.features,
    });

    await manageRole.createRole({
      id: 'r-a',
      code: 'ROLE_A',
      name: 'Role A',
      permissions: ['orders:read'],
      isSystem: true,
    });
    await manageRole.createRole({
      id: 'r-b',
      code: 'ROLE_B',
      name: 'Role B',
      permissions: ['orders:create'],
      inheritsFrom: ['r-a'],
    });

    await expect(manageRole.deleteRole('r-a')).rejects.toThrow(SystemRoleImmutableError);
    await expect(
      manageRole.updateRole({ roleId: 'r-a', inheritsFrom: ['r-b'] })
    ).rejects.toThrow(CyclicRoleInheritanceError);

    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });
    await register.execute({
      id: 'u-rev',
      username: 'sofia',
      displayName: 'Sofia',
      password: 'password123',
      initialRoles: [{ roleId: 'r-b' }],
    });

    const auth = new AuthenticateUserUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });
    const login = await auth.execute({ identifier: 'sofia', secret: 'password123' });

    const assignRole = new AssignUserRoleUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      features: ctx.features,
    });
    await assignRole.revokeRole({ userId: 'u-rev', roleId: 'r-b', actorId: 'admin-1' });

    const verify = new VerifySessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });
    await expect(verify.execute({ accessToken: login.accessToken! })).rejects.toThrow(
      SessionInvalidError
    );
  });

  it('enforces optimistic concurrency on stale user instances', async () => {
    const ctx = setup();
    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });
    await register.execute({
      id: 'u-conc',
      username: 'concurrent',
      displayName: 'Concurrent',
      password: 'password123',
    });

    const copy1 = await ctx.userRepo.findById('u-conc');
    const copy2 = await ctx.userRepo.findById('u-conc');
    expect(copy1).not.toBeNull();
    expect(copy2).not.toBeNull();

    copy1!.changePinHash('hashed:5555');
    await ctx.userRepo.save(copy1!);

    copy2!.changePinHash('hashed:6666');
    await expect(ctx.userRepo.save(copy2!)).rejects.toThrow(ConcurrencyError);
  });
});
