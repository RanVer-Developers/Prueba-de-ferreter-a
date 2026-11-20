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
import { InvalidCredentialsError, UserNotFoundError } from '../domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  assertAuthRbacFeatureEnabled,
  isAuthRbacFeatureEnabled,
} from '../domain/services/auth-features.js';
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
  newPin: z.string().trim().min(4, 'PIN must be at least 4 characters.'),
  actorId: NonEmptyIdSchema.optional(),
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
  newPin: string;
  actorId?: string;
}

export interface ChangeCredentialsDeps {
  userRepo: IUserRepository;
  passwordHasher: IPasswordHasher;
  sessionRepo?: ISessionRepository;
  auditRepo?: IAuditRepository;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  features?: AuthRbacFeatureFlags;
}

export class ChangeCredentialsUseCase {
  private readonly clock: IClock;

  constructor(private readonly deps: ChangeCredentialsDeps) {
    this.clock = deps.clock ?? SystemClock;
  }

  public async changePassword(rawInput: ChangePasswordInput): Promise<void> {
    const input = parseWithAuthSchema(ChangePasswordSchema, rawInput, 'change password input');
    const now = this.clock.now();

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    if (!input.skipCurrentCheck) {
      if (!input.currentPassword || !user.passwordHash) {
        throw new InvalidCredentialsError('Current password is required.');
      }
      const valid = await this.deps.passwordHasher.verify(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new InvalidCredentialsError('Current password is incorrect.');
      }
    }

    const newHash = await this.deps.passwordHasher.hash(input.newPassword);
    user.changePasswordHash(newHash, now);
    await this.deps.userRepo.save(user);

    if (this.deps.sessionRepo && isAuthRbacFeatureEnabled(this.deps.features, 'sessionManagement')) {
      await this.deps.sessionRepo.revokeAllForUser(user.id, 'Password changed', now);
    }

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
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
    assertAuthRbacFeatureEnabled(this.deps.features, 'pinAuth');
    const input = parseWithAuthSchema(ChangePinSchema, rawInput, 'change pin input');
    const now = this.clock.now();

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    const newPinHash = await this.deps.passwordHasher.hash(input.newPin);
    user.changePinHash(newPinHash, now);
    await this.deps.userRepo.save(user);

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.deps.features, 'auditTrail')) {
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
