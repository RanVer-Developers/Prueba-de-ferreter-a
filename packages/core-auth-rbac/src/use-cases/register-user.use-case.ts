import { z } from 'zod';
import {
  AuthEventPublisher,
  IAuditRepository,
  IClock,
  IIdGenerator,
  IPasswordHasher,
  IRoleRepository,
  IUserRepository,
  SystemClock,
} from '../contracts/auth-contracts.js';
import { AuthUser, AuthUserPublicSummary } from '../domain/entities/user.js';
import { DuplicateUserError, RoleNotFoundError } from '../domain/errors/auth-rbac-errors.js';
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
  DirectPermissionsSchema,
  EmailSchema,
  NonEmptyIdSchema,
  Scope,
  ScopeSchema,
  UsernameSchema,
  parseWithAuthSchema,
} from '../schemas/auth-rbac.schemas.js';

const RegisterUserInputSchema = z
  .object({
    id: NonEmptyIdSchema,
    username: UsernameSchema,
    email: EmailSchema.optional(),
    displayName: z.string().trim().min(1),
    password: z.string().min(6, 'Password must be at least 6 characters.').optional(),
    pin: z.string().trim().min(4, 'PIN must be at least 4 characters.').optional(),
    initialRoles: z
      .array(
        z.object({
          roleId: NonEmptyIdSchema,
          scope: ScopeSchema.optional(),
        })
      )
      .default([]),
    directPermissions: DirectPermissionsSchema.optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    actorId: NonEmptyIdSchema.optional(),
  })
  .refine((v) => v.password !== undefined || v.pin !== undefined, {
    message: 'At least one credential (password or pin) must be provided.',
  });

export interface RegisterUserInput {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  password?: string;
  pin?: string;
  initialRoles?: Array<{ roleId: string; scope?: Scope }>;
  directPermissions?: { allow?: string[]; deny?: string[] };
  metadata?: Record<string, string | number | boolean>;
  actorId?: string;
}

export interface RegisterUserDeps {
  userRepo: IUserRepository;
  roleRepo: IRoleRepository;
  passwordHasher: IPasswordHasher;
  auditRepo?: IAuditRepository;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  passwordPolicy?: PasswordPolicy;
  features?: AuthRbacFeatureProfile;
}

export class RegisterUserUseCase {
  private readonly clock: IClock;
  private readonly features: AuthRbacFeatureFlags;

  constructor(private readonly deps: RegisterUserDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveAuthRbacFeatures(deps.features);
  }

  public async execute(rawInput: RegisterUserInput): Promise<AuthUserPublicSummary> {
    const input = parseWithAuthSchema(RegisterUserInputSchema, rawInput, 'register user input');
    const now = this.clock.now();

    if (input.pin !== undefined) {
      assertAuthRbacFeatureEnabled(this.features, 'pinAuth');
    }
    if (
      input.password !== undefined &&
      this.deps.passwordPolicy &&
      isAuthRbacFeatureEnabled(this.features, 'passwordPolicy')
    ) {
      assertPasswordPolicy(input.password, this.deps.passwordPolicy, [input.username, input.email]);
    }

    if (await this.deps.userRepo.findById(input.id)) {
      throw new DuplicateUserError('id', input.id);
    }
    if (await this.deps.userRepo.findByUsername(input.username)) {
      throw new DuplicateUserError('username', input.username);
    }
    if (input.email && (await this.deps.userRepo.findByEmail(input.email))) {
      throw new DuplicateUserError('email', input.email);
    }

    const assignments = [];
    for (const item of input.initialRoles) {
      if (item.scope && (item.scope.tenantId || item.scope.branchId)) {
        assertAuthRbacFeatureEnabled(this.features, 'scopedRoles');
      }
      const role = await this.deps.roleRepo.findById(item.roleId);
      if (!role) {
        throw new RoleNotFoundError(item.roleId);
      }
      assignments.push({
        roleId: role.id,
        ...(item.scope ? { scope: item.scope } : {}),
        assignedAt: now.toISOString(),
        ...(input.actorId ? { assignedBy: input.actorId } : {}),
      });
    }

    if (input.directPermissions?.deny && input.directPermissions.deny.length > 0) {
      assertAuthRbacFeatureEnabled(this.features, 'explicitDeny');
    }

    const passwordHash = input.password
      ? await this.deps.passwordHasher.hash(input.password)
      : undefined;
    const pinHash = input.pin ? await this.deps.passwordHasher.hash(input.pin) : undefined;

    const user = AuthUser.create({
      id: input.id,
      username: input.username,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      pinHash,
      assignments,
      directPermissions: input.directPermissions,
      metadata: input.metadata,
      now,
    });

    await this.deps.userRepo.save(user);

    await this.deps.publishEvent?.({
      type: 'UserRegistered',
      userId: user.id,
      username: user.username,
      occurredAt: now.toISOString(),
    });

    if (this.deps.auditRepo && isAuthRbacFeatureEnabled(this.features, 'auditTrail')) {
      await this.deps.auditRepo.append({
        schemaVersion: AUTH_RBAC_SCHEMA_VERSION,
        id: this.deps.idGenerator?.nextId() ?? globalThis.crypto.randomUUID(),
        action: 'USER_REGISTERED',
        actorId: input.actorId ?? user.id,
        targetUserId: user.id,
        outcome: 'SUCCESS',
        occurredAt: now.toISOString(),
      });
    }

    return user.toPublicSummary();
  }
}
