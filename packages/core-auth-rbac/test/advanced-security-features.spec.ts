import { describe, expect, it } from 'vitest';
import {
  AssignUserRoleUseCase,
  AuthenticateUserUseCase,
  AuthorizeActionUseCase,
  DEFAULT_PASSWORD_POLICY,
  FeatureDisabledError,
  IMfaVerifier,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InvalidAuthInputError,
  InvalidCredentialsError,
  ManageRoleUseCase,
  MfaRequiredError,
  RegisterUserUseCase,
  SessionInvalidError,
  SessionLimitExceededError,
  VerifySessionUseCase,
  resolveAuthRbacFeatures,
} from '../src/index.js';
import { ManualClock, TestPasswordHasher, TestTokenGenerator } from './test-helpers.js';

describe('@modulos/core-auth-rbac: Flagged Advanced Security Features', () => {
  it('enforces passwordPolicy on registration when enabled', async () => {
    const userRepo = new InMemoryUserRepository({ isolate: true });
    const roleRepo = new InMemoryRoleRepository({ isolate: true });
    const register = new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: new TestPasswordHasher(),
      passwordPolicy: DEFAULT_PASSWORD_POLICY,
      features: resolveAuthRbacFeatures('ADVANCED'),
    });

    await expect(
      register.execute({
        id: 'u1',
        username: 'alberto',
        displayName: 'Alberto',
        password: 'weak',
      })
    ).rejects.toThrow(InvalidAuthInputError);

    await expect(
      register.execute({
        id: 'u1',
        username: 'alberto',
        displayName: 'Alberto',
        password: 'Alberto123', // contains username
      })
    ).rejects.toThrow(InvalidAuthInputError);

    const created = await register.execute({
      id: 'u1',
      username: 'alberto',
      displayName: 'Alberto',
      password: 'StrongPass99',
    });
    expect(created.id).toBe('u1');
  });

  it('enforces MFA challenge when mfaRequired and mfaChallenge feature are active', async () => {
    const userRepo = new InMemoryUserRepository({ isolate: true });
    const roleRepo = new InMemoryRoleRepository({ isolate: true });
    const register = new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: new TestPasswordHasher(),
    });
    await register.execute({
      id: 'u-mfa',
      username: 'mfauser',
      displayName: 'MFA User',
      password: 'Password123',
    });
    const stored = (await userRepo.findById('u-mfa'))!;
    stored.setMfaRequired(true);
    await userRepo.save(stored);

    const mfaVerifier: IMfaVerifier = {
      verify: (_userId, code) => code === '654321',
    };

    const authenticate = new AuthenticateUserUseCase({
      userRepo,
      passwordHasher: new TestPasswordHasher(),
      mfaVerifier,
      features: resolveAuthRbacFeatures('ADVANCED'),
    });

    await expect(
      authenticate.execute({ identifier: 'mfauser', secret: 'Password123' })
    ).rejects.toThrow(MfaRequiredError);

    await expect(
      authenticate.execute({ identifier: 'mfauser', secret: 'Password123', mfaCode: '000000' })
    ).rejects.toThrow(InvalidCredentialsError);

    const ok = await authenticate.execute({
      identifier: 'mfauser',
      secret: 'Password123',
      mfaCode: '654321',
    });
    expect(ok.user.id).toBe('u-mfa');
  });

  it('enforces sessionConcurrencyLimit with REJECT_NEW and REVOKE_OLDEST strategies', async () => {
    const clock = new ManualClock();
    const userRepo = new InMemoryUserRepository({ isolate: true });
    const roleRepo = new InMemoryRoleRepository({ isolate: true });
    const sessionRepo = new InMemorySessionRepository({ isolate: true });
    const tokenGenerator = new TestTokenGenerator();
    const register = new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: new TestPasswordHasher(),
      clock,
    });
    await register.execute({
      id: 'u-lim',
      username: 'posuser',
      displayName: 'POS User',
      password: 'Password123',
    });

    const authReject = new AuthenticateUserUseCase({
      userRepo,
      passwordHasher: new TestPasswordHasher(),
      sessionRepo,
      tokenGenerator,
      clock,
      sessionPolicy: { accessTtlMs: 60_000, maxConcurrentSessions: 1, concurrencyStrategy: 'REJECT_NEW' },
      features: resolveAuthRbacFeatures('ADVANCED'),
    });

    const s1 = await authReject.execute({ identifier: 'posuser', secret: 'Password123' });
    await expect(
      authReject.execute({ identifier: 'posuser', secret: 'Password123' })
    ).rejects.toThrow(SessionLimitExceededError);

    clock.advanceMs(1000);
    const authRevokeOldest = new AuthenticateUserUseCase({
      userRepo,
      passwordHasher: new TestPasswordHasher(),
      sessionRepo,
      tokenGenerator,
      clock,
      sessionPolicy: { accessTtlMs: 60_000, maxConcurrentSessions: 1, concurrencyStrategy: 'REVOKE_OLDEST' },
      features: resolveAuthRbacFeatures('ADVANCED'),
    });

    const s2 = await authRevokeOldest.execute({ identifier: 'posuser', secret: 'Password123' });
    const verify = new VerifySessionUseCase({ sessionRepo, userRepo, tokenGenerator, clock });
    await expect(verify.execute({ accessToken: s1.accessToken! })).rejects.toThrow(SessionInvalidError);
    expect((await verify.execute({ accessToken: s2.accessToken! })).user.id).toBe('u-lim');
  });

  it('supports temporaryRoleGrants that expire automatically and respects feature flag', async () => {
    const clock = new ManualClock('2026-11-19T10:00:00.000Z');
    const userRepo = new InMemoryUserRepository({ isolate: true });
    const roleRepo = new InMemoryRoleRepository({ isolate: true });
    const manageRole = new ManageRoleUseCase({ roleRepo, clock });
    await manageRole.createRole({
      id: 'r-temp',
      code: 'TEMP_MGR',
      name: 'Temp Manager',
      permissions: ['cashier:void'],
    });

    const register = new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: new TestPasswordHasher(),
      clock,
    });
    await register.execute({
      id: 'u-temp',
      username: 'tempuser',
      displayName: 'Temp',
      password: 'Password123',
    });

    const assignBasic = new AssignUserRoleUseCase({
      userRepo,
      roleRepo,
      clock,
      features: resolveAuthRbacFeatures('BASIC'),
    });
    await expect(
      assignBasic.assignRole({
        userId: 'u-temp',
        roleId: 'r-temp',
        expiresAt: new Date('2026-11-19T11:00:00.000Z'),
      })
    ).rejects.toThrow(FeatureDisabledError);

    const assignAdv = new AssignUserRoleUseCase({
      userRepo,
      roleRepo,
      clock,
      features: resolveAuthRbacFeatures('ADVANCED'),
    });
    await assignAdv.assignRole({
      userId: 'u-temp',
      roleId: 'r-temp',
      expiresAt: new Date('2026-11-19T11:00:00.000Z'),
    });

    const authorize = new AuthorizeActionUseCase({
      userRepo,
      roleRepo,
      clock,
      features: resolveAuthRbacFeatures('ADVANCED'),
    });

    expect((await authorize.evaluate({ userId: 'u-temp', permission: 'cashier:void' })).allowed).toBe(true);

    // Advance past expiresAt (61 minutes)
    clock.advanceMs(61 * 60_000);
    expect((await authorize.evaluate({ userId: 'u-temp', permission: 'cashier:void' })).allowed).toBe(false);
  });
});
