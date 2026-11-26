import { describe, expect, it } from 'vitest';
import {
  AccountLockedError,
  AuthenticateUserUseCase,
  ChangeCredentialsUseCase,
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InvalidAuthInputError,
  InvalidCredentialsError,
  ManageRoleUseCase,
  RefreshSessionUseCase,
  RegisterUserUseCase,
  RevokeSessionUseCase,
  SessionInvalidError,
  UserNotActiveError,
  VerifySessionUseCase,
  resolveAuthRbacFeatures,
} from '../src/index.js';
import { ManualClock, TestPasswordHasher, TestTokenGenerator } from './test-helpers.js';

describe('Authentication, brute-force lockout, and session lifecycle', () => {
  function setup() {
    const clock = new ManualClock('2026-11-17T10:00:00.000Z');
    const userRepo = new InMemoryUserRepository({ isolate: true });
    const roleRepo = new InMemoryRoleRepository({ isolate: true });
    const sessionRepo = new InMemorySessionRepository({ isolate: true });
    const auditRepo = new InMemoryAuditRepository();
    const passwordHasher = new TestPasswordHasher();
    const tokenGenerator = new TestTokenGenerator();
    const features = resolveAuthRbacFeatures('ADVANCED');

    return {
      clock,
      userRepo,
      roleRepo,
      sessionRepo,
      auditRepo,
      passwordHasher,
      tokenGenerator,
      features,
    };
  }

  it('registers user with hashed credentials, authenticates via password and PIN, verifies, refreshes, and revokes sessions', async () => {
    const ctx = setup();
    const manageRole = new ManageRoleUseCase({
      roleRepo: ctx.roleRepo,
      clock: ctx.clock,
      features: ctx.features,
    });
    await manageRole.createRole({
      id: 'role-cashier',
      code: 'CASHIER',
      name: 'Cashier',
      permissions: ['cashier:sale', 'orders:create'],
    });

    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      features: ctx.features,
    });

    await register.execute({
      id: 'usr-1',
      username: 'Ana.Lopez',
      email: 'ANA@Example.com',
      displayName: 'Ana Lopez',
      password: 'Password!2026',
      pin: '4829',
      initialRoles: [{ roleId: 'role-cashier', scope: { tenantId: 't1', branchId: 'b1' } }],
    });

    const storedUser = await ctx.userRepo.findById('usr-1');
    expect(storedUser?.passwordHash).toBe('hashed:Password!2026');
    expect(storedUser?.pinHash).toBe('hashed:4829');
    expect(storedUser?.username).toBe('ana.lopez');
    expect(storedUser?.email).toBe('ana@example.com');

    const authenticate = new AuthenticateUserUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      tokenGenerator: ctx.tokenGenerator,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      sessionPolicy: { accessTtlMs: 60_000, refreshTtlMs: 300_000 },
      features: ctx.features,
    });

    const authResult = await authenticate.execute({
      method: 'PASSWORD',
      identifier: 'ana@example.com',
      secret: 'Password!2026',
      scope: { tenantId: 't1', branchId: 'b1' },
    });

    expect(authResult.accessToken).toBeDefined();
    expect(authResult.refreshToken).toBeDefined();
    expect(authResult.session?.scope).toEqual({ tenantId: 't1', branchId: 'b1' });

    const verify = new VerifySessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });

    const verified = await verify.execute({
      accessToken: authResult.accessToken!,
      touchActivity: true,
    });
    expect(verified.user.id).toBe('usr-1');

    // Refresh rotates both access and refresh tokens, invalidating old ones.
    ctx.clock.advanceMs(30_000);
    const refresh = new RefreshSessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      sessionPolicy: { accessTtlMs: 60_000, refreshTtlMs: 300_000 },
      features: ctx.features,
    });
    const refreshed = await refresh.execute({ refreshToken: authResult.refreshToken! });
    expect(refreshed.accessToken).not.toBe(authResult.accessToken);
    expect(refreshed.refreshToken).not.toBe(authResult.refreshToken);

    await expect(verify.execute({ accessToken: authResult.accessToken! })).rejects.toThrow(
      SessionInvalidError
    );
    await expect(refresh.execute({ refreshToken: authResult.refreshToken! })).rejects.toThrow(
      SessionInvalidError
    );

    // PIN authentication works independently for POS terminals.
    const pinAuth = await authenticate.execute({
      method: 'PIN',
      identifier: 'ana.lopez',
      secret: '4829',
    });
    expect(pinAuth.user.id).toBe('usr-1');

    // Revoking single session invalidates it immediately.
    const revoke = new RevokeSessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      features: ctx.features,
    });
    await revoke.revokeOne(refreshed.session.id, 'User clicked logout');
    await expect(verify.execute({ accessToken: refreshed.accessToken })).rejects.toThrow(
      SessionInvalidError
    );
  });

  it('locks account after max failed attempts and auto-unlocks after lockDurationMs', async () => {
    const ctx = setup();
    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });
    await register.execute({
      id: 'usr-bf',
      username: 'juan',
      displayName: 'Juan',
      password: 'correct-password',
    });

    const authenticate = new AuthenticateUserUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      lockoutPolicy: { maxAttempts: 3, lockDurationMs: 60_000 },
      features: ctx.features,
    });

    await expect(
      authenticate.execute({ identifier: 'juan', secret: 'wrong-1' })
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      authenticate.execute({ identifier: 'juan', secret: 'wrong-2' })
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      authenticate.execute({ identifier: 'juan', secret: 'wrong-3' })
    ).rejects.toThrow(AccountLockedError);

    // Even with the right password while locked, login must fail.
    await expect(
      authenticate.execute({ identifier: 'juan', secret: 'correct-password' })
    ).rejects.toThrow(AccountLockedError);

    // Advance past lock duration -> unlocks automatically on valid attempt.
    ctx.clock.advanceMs(61_000);
    const ok = await authenticate.execute({ identifier: 'juan', secret: 'correct-password' });
    expect(ok.user.status).toBe('ACTIVE');

    const reloaded = await ctx.userRepo.findById('usr-bf');
    expect(reloaded?.failedAttempts).toBe(0);
  });

  it('invalidates all active sessions via tokenVersion when password changes', async () => {
    const ctx = setup();
    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });
    await register.execute({
      id: 'usr-pw',
      username: 'maria',
      displayName: 'Maria',
      password: 'old-password',
    });

    const authenticate = new AuthenticateUserUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });
    const sessionRes = await authenticate.execute({
      identifier: 'maria',
      secret: 'old-password',
    });

    const changeCredentials = new ChangeCredentialsUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      features: ctx.features,
    });

    await changeCredentials.changePassword({
      userId: 'usr-pw',
      currentPassword: 'old-password',
      newPassword: 'new-strong-password',
    });

    const verify = new VerifySessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });

    await expect(verify.execute({ accessToken: sessionRes.accessToken! })).rejects.toThrow(
      SessionInvalidError
    );

    const newLogin = await authenticate.execute({
      identifier: 'maria',
      secret: 'new-strong-password',
    });
    expect(newLogin.user.tokenVersion).toBe(2);
  });

  it('handles session TTL expiration, bulk revokeAllForUser, changePin, and feature flag guards', async () => {
    const ctx = setup();
    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });
    await register.execute({
      id: 'usr-ttl',
      username: 'carlos',
      displayName: 'Carlos',
      password: 'password123',
      pin: '1234',
    });

    const authenticate = new AuthenticateUserUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      sessionPolicy: { accessTtlMs: 30_000, refreshTtlMs: 60_000 },
      features: ctx.features,
    });

    const session1 = await authenticate.execute({ identifier: 'carlos', secret: 'password123' });
    const session2 = await authenticate.execute({ identifier: 'carlos', secret: 'password123' });

    const verify = new VerifySessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });

    // Advance past accessTtlMs (30s) -> VerifySession rejects, RefreshSession still succeeds (< 60s).
    ctx.clock.advanceMs(35_000);
    await expect(verify.execute({ accessToken: session1.accessToken! })).rejects.toThrow(
      SessionInvalidError
    );

    const refresh = new RefreshSessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      sessionPolicy: { accessTtlMs: 30_000, refreshTtlMs: 60_000 },
      features: ctx.features,
    });
    const refreshed1 = await refresh.execute({ refreshToken: session1.refreshToken! });
    const verifiedAfterRefresh = await verify.execute({ accessToken: refreshed1.accessToken });
    expect(verifiedAfterRefresh.user.id).toBe('usr-ttl');

    // Change PIN and verify authentication works with the new PIN.
    const changeCreds = new ChangeCredentialsUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      features: ctx.features,
    });
    await changeCreds.changePin({ userId: 'usr-ttl', newPin: '9876' });
    const pinOk = await authenticate.execute({ method: 'PIN', identifier: 'carlos', secret: '9876' });
    expect(pinOk.user.id).toBe('usr-ttl');

    // Revoke all active sessions for user.
    const revoke = new RevokeSessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      auditRepo: ctx.auditRepo,
      clock: ctx.clock,
      features: ctx.features,
    });
    const revokedCount = await revoke.revokeAllForUser('usr-ttl', 'Security reset');
    expect(revokedCount).toBeGreaterThanOrEqual(2);
    await expect(verify.execute({ accessToken: refreshed1.accessToken })).rejects.toThrow(
      SessionInvalidError
    );
    await expect(verify.execute({ accessToken: session2.accessToken! })).rejects.toThrow(
      SessionInvalidError
    );
  });

  it('prevents user status enumeration on invalid credentials and validates/unlocks in verify & refresh', async () => {
    const ctx = setup();
    const register = new RegisterUserUseCase({
      userRepo: ctx.userRepo,
      roleRepo: ctx.roleRepo,
      passwordHasher: ctx.passwordHasher,
      clock: ctx.clock,
      features: ctx.features,
    });

    await register.execute({
      id: 'usr-inactive',
      username: 'inactivo',
      displayName: 'Inactivo',
      password: 'secret-password',
    });
    const inactiveUser = await ctx.userRepo.findById('usr-inactive');
    expect(inactiveUser).not.toBeNull();
    inactiveUser!.setStatus('INACTIVE', ctx.clock.now());
    await ctx.userRepo.save(inactiveUser!);
    expect(inactiveUser!.status).toBe('INACTIVE');

    const authenticate = new AuthenticateUserUseCase({
      userRepo: ctx.userRepo,
      passwordHasher: ctx.passwordHasher,
      sessionRepo: ctx.sessionRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      lockoutPolicy: { maxAttempts: 2, lockDurationMs: 60_000 },
      features: ctx.features,
    });

    // Wrong password on INACTIVE user must NOT leak UserNotActiveError.
    await expect(
      authenticate.execute({ identifier: 'inactivo', secret: 'wrong-password' })
    ).rejects.toThrow(InvalidCredentialsError);

    // Valid password on INACTIVE user throws UserNotActiveError.
    await expect(
      authenticate.execute({ identifier: 'inactivo', secret: 'secret-password' })
    ).rejects.toThrow(UserNotActiveError);

    // Active user logs in, gets temporarily locked, then lock expires -> verify persists unlock.
    await register.execute({
      id: 'usr-unlock',
      username: 'lucia',
      displayName: 'Lucia',
      password: 'lucia-password',
    });
    const login = await authenticate.execute({ identifier: 'lucia', secret: 'lucia-password' });

    await expect(
      authenticate.execute({ identifier: 'lucia', secret: 'bad-1' })
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      authenticate.execute({ identifier: 'lucia', secret: 'bad-2' })
    ).rejects.toThrow(AccountLockedError);

    ctx.clock.advanceMs(61_000);

    const verify = new VerifySessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });
    const refresh = new RefreshSessionUseCase({
      sessionRepo: ctx.sessionRepo,
      userRepo: ctx.userRepo,
      tokenGenerator: ctx.tokenGenerator,
      clock: ctx.clock,
      features: ctx.features,
    });

    // Malformed payloads fail cleanly with InvalidAuthInputError instead of TypeError.
    await expect(verify.execute({ accessToken: undefined as unknown as string })).rejects.toThrow(
      InvalidAuthInputError
    );
    await expect(refresh.execute({ refreshToken: undefined as unknown as string })).rejects.toThrow(
      InvalidAuthInputError
    );

    const verified = await verify.execute({ accessToken: login.accessToken! });
    expect(verified.user.status).toBe('ACTIVE');

    const persistedAfterVerify = await ctx.userRepo.findById('usr-unlock');
    expect(persistedAfterVerify?.status).toBe('ACTIVE');
    expect(persistedAfterVerify?.failedAttempts).toBe(0);
  });
});
