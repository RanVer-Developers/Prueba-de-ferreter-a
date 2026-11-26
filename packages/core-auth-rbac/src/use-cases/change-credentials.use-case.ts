import { z } from 'zod';
import {
  IAuditRepository,
  IClock,
  IIdGenerator,
  IPasswordHasher,
  ISessionRepository,
  IUserRepository,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { AccessDeniedError, InvalidAuthInputError, InvalidCredentialsError, UserNotFoundError } from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  AuthRbacFeatureProfile,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
  resolveAuthRbacFeatures,
} from '../domain/services/auth-features.js';
import {
  PasswordPolicy,
  assertPasswordPolicy,
} from '../domain/services/password-policy.service.js';
import {
  AUTH_RBAC_SCHEMA_VERSION,
  NonEmptyIdSchema,
  parseWithAuthSchema,
} from '../schemas/auth-rbac.schemas.js';

const ChangePasswordSchema = z.object({
  userId: NonEmptyIdSchema,
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.'),
  skipCurrentCheck: z.boolean().default(false),
  actorId: NonEmptyIdSchema.optional(),
});

const ChangePinSchema = z.object({
  userId: NonEmptyIdSchema,
  currentPin: z.string().trim().min(1).optional(),
  currentPassword: z.string().min(1).optional(),
  newPin: z
    .string()
    .trim()
    .regex(/^\d{4,12}$/, 'PIN must consist of 4 to 12 digits.')
    .refine((pin) => !/^(\d)\1+$/.test(pin), 'PIN cannot consist of identical repeated digits.'),
  actorId: NonEmptyIdSchema.optional(),
  revokeExistingSessions: z.boolean().default(false),
});

export interface ChangePasswordInput {
  userId: string;
  currentPassword?: string;
  newPassword: string;
  skipCurrentCheck?: boolean;
  actorId?: string;
}

export interface ChangePinInput {
  userId: string;
  currentPin?: string;
  currentPassword?: string;
  newPin: string;
  actorId?: string;
  revokeExistingSessions?: boolean;
}

export interface ChangeCredentialsDeps {
  userRepo: IUserRepository;
  passwordHasher: IPasswordHasher;
  sessionRepo?: ISessionRepository;
  auditRepo?: IAuditRepository;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  passwordPolicy?: PasswordPolicy;
  features?: AuthRbacFeatureProfile;
}

export class ChangeCredentialsUseCase {
  private readonly clock: IClock;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: ChangeCredentialsDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async changePassword(rawInput: ChangePasswordInput): Promise<void> {
    const input = parseWithAuthSchema(ChangePasswordSchema, rawInput, 'change password input');
    const now = this.clock.now();

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    if (input.skipCurrentCheck) {
      if (!input.actorId || input.actorId === user.id) {
        throw new AccessDeniedError(
          'users:reset_password',
          'Administrative password reset without currentPassword requires a distinct actorId.'
        );
      }
    } else {
      if (!input.currentPassword || !user.passwordHash) {
        throw new InvalidCredentialsError('Current password is required.');
      }
      const valid = await this.deps.passwordHasher.verify(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new InvalidCredentialsError('Current password is incorrect.');
      }
    }

    if (
      this.deps.passwordPolicy &&
      isAuthRbacFeatureEnabled(this.features, 'passwordPolicy')
    ) {
      assertPasswordPolicy(input.newPassword, this.deps.passwordPolicy, [user.username, user.email]);
    }

    const newHash = await this.deps.passwordHasher.hash(input.newPassword);
    user.changePasswordHash(newHash, now);
    await this.deps.userRepo.save(user);

    if (this.deps.sessionRepo && isAuthRbacFeatureEnabled(this.features, 'sessionManagement')) {
      await this.deps.sessionRepo.revokeAllForUser(user.id, 'Password changed', now);
    }

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'PASSWORD_CHANGED',
        actorId: input.actorId ?? user.id,
        targetUserId: user.id,
        outcome: 'SUCCESS',
        occurredAt: now.toISOString(),
      });
    }
  }

  public async changePin(rawInput: ChangePinInput): Promise<void> {
    assertAuthRbacFeatureEnabled(this.features, 'pinAuth');
    const input = parseWithAuthSchema(ChangePinSchema, rawInput, 'change pin input');
    const now = this.clock.now();

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    if (input.currentPin !== undefined) {
      if (!user.pinHash) {
        throw new InvalidCredentialsError('User has no PIN configured.');
      }
      const validPin = await this.deps.passwordHasher.verify(input.currentPin, user.pinHash);
      if (!validPin) {
        throw new InvalidCredentialsError('Current PIN is incorrect.');
      }
    } else if (input.currentPassword !== undefined) {
      if (!user.passwordHash) {
        throw new InvalidCredentialsError('User has no password configured.');
      }
      const validPassword = await this.deps.passwordHasher.verify(input.currentPassword, user.passwordHash);
      if (!validPassword) {
        throw new InvalidCredentialsError('Current password is incorrect.');
      }
    } else if (input.actorId !== undefined && input.actorId === user.id) {
      throw new InvalidAuthInputError('Self-service PIN change requires currentPin or currentPassword.');
    }

    const newPinHash = await this.deps.passwordHasher.hash(input.newPin);
    user.changePinHash(newPinHash, now);
    if (input.revokeExistingSessions) {
      user.bumpTokenVersion(now);
    }
    await this.deps.userRepo.save(user);

    if (
      input.revokeExistingSessions &&
      this.deps.sessionRepo &&
      isAuthRbacFeatureEnabled(this.features, 'sessionManagement')
    ) {
      await this.deps.sessionRepo.revokeAllForUser(user.id, 'PIN changed', now);
    }

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'PIN_CHANGED',
        actorId: input.actorId ?? user.id,
        targetUserId: user.id,
        outcome: 'SUCCESS',
        occurredAt: now.toISOString(),
      });
    }
  }
}
