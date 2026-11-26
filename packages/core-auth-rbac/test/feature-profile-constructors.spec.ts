import { describe, expect, it } from 'vitest';
import {
  AssignUserRoleUseCase,
  AuthenticateUserUseCase,
  AuthorizeActionUseCase,
  ChangeCredentialsUseCase,
  FeatureDisabledError,
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  ManageRoleUseCase,
  RefreshSessionUseCase,
  RegisterUserUseCase,
  RevokeSessionUseCase,
  VerifySessionUseCase,
} from '../src/index.js';
import { ManualClock, TestPasswordHasher, TestTokenGenerator } from './test-helpers.js';

describe('@modulos/core-auth-rbac: AuthRbacFeatureProfile in use-case constructors', () => {
  it('resolves BASIC tier profile directly in all use-case constructors', async () => {
    const userRepo = new InMemoryUserRepository();
    const roleRepo = new InMemoryRoleRepository();
    const sessionRepo = new InMemorySessionRepository();
    const auditRepo = new InMemoryAuditRepository();
    const clock = new ManualClock();
    const passwordHasher = new TestPasswordHasher();
    const tokenGenerator = new TestTokenGenerator();

    const manageRole = new ManageRoleUseCase({ roleRepo, auditRepo, clock, features: 'BASIC' });
    await expect(
      manageRole.createRole({
        id: 'role-basic-deny',
        code: 'BASIC_DENY',
        name: 'Basic Deny',
        deniedPermissions: ['orders:delete'],
      })
    ).rejects.toThrow(FeatureDisabledError);

    const role = await manageRole.createRole({
      id: 'role-cashier',
      code: 'CASHIER',
      name: 'Cashier',
      permissions: ['orders:create'],
    });
    expect(role.code).toBe('CASHIER');

    const registerUser = new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher,
      auditRepo,
      clock,
      features: 'BASIC',
    });
    await registerUser.execute({
      id: 'u-1',
      username: 'ana',
      displayName: 'Ana',
      password: 'password123',
      initialRoles: [{ roleId: 'role-cashier' }],
    });

    const assignRole = new AssignUserRoleUseCase({
      userRepo,
      roleRepo,
      auditRepo,
      clock,
      features: 'BASIC',
    });
    await expect(
      assignRole.assignRole({
        userId: 'u-1',
        roleId: 'role-cashier',
        scope: { tenantId: 't-1', branchId: 'br-1' },
      })
    ).rejects.toThrow(FeatureDisabledError);

    const authenticate = new AuthenticateUserUseCase({
      userRepo,
      passwordHasher,
      sessionRepo,
      tokenGenerator,
      clock,
      features: 'BASIC',
    });
    const authResult = await authenticate.execute({
      method: 'PASSWORD',
      identifier: 'ana',
      secret: 'password123',
    });
    expect(authResult.accessToken).toBeTruthy();

    const verifySession = new VerifySessionUseCase({
      sessionRepo,
      userRepo,
      tokenGenerator,
      clock,
      features: 'BASIC',
    });
    const verified = await verifySession.execute({ accessToken: authResult.accessToken! });
    expect(verified.user.id).toBe('u-1');

    const refreshSession = new RefreshSessionUseCase({
      sessionRepo,
      userRepo,
      tokenGenerator,
      clock,
      features: 'BASIC',
    });
    await expect(refreshSession.execute({ refreshToken: 'any' })).rejects.toThrow(
      FeatureDisabledError
    );

    const authorize = new AuthorizeActionUseCase({
      userRepo,
      roleRepo,
      passwordHasher,
      clock,
      features: 'BASIC',
    });
    await expect(
      authorize.authorizeSupervisorOverride({
        requesterId: 'u-1',
        approverIdentifier: 'sup',
        approverSecret: '1234',
        permission: 'orders:void',
      })
    ).rejects.toThrow(FeatureDisabledError);

    const changeCreds = new ChangeCredentialsUseCase({
      userRepo,
      passwordHasher,
      sessionRepo,
      clock,
      features: { pinAuth: false },
    });
    await expect(
      changeCreds.changePin({
        userId: 'u-1',
        currentPassword: 'password123',
        newPin: '4829',
      })
    ).rejects.toThrow(FeatureDisabledError);

    const revoke = new RevokeSessionUseCase({
      sessionRepo,
      userRepo,
      clock,
      features: { sessionManagement: false },
    });
    await expect(revoke.revokeOne(authResult.session!.id)).rejects.toThrow(FeatureDisabledError);

    // BASIC disables auditTrail, so auditRepo remains empty despite being passed
    expect(auditRepo.listAll()).toHaveLength(0);
  });
});
