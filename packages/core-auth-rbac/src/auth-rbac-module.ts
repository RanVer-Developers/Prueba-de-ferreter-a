import {
  AuthEventPublisher,
  IAuditRepository,
  IClock,
  IIdGenerator,
  IMfaVerifier,
  IPasswordHasher,
  IRoleRepository,
  ISessionRepository,
  ITokenGenerator,
  IUserRepository,
  SessionPolicy,
  SystemClock,
} from './contracts/auth-contracts.js';
import { LockoutPolicy } from './domain/entities/user.js';
import { InvalidAuthInputError } from './domain/errors/auth-rbac-errors.js';
import {
  AuthRbacFeatureFlags,
  AuthRbacFeatureProfile,
  resolveAuthRbacFeatures,
} from './domain/services/auth-features.js';
import { PasswordPolicy } from './domain/services/password-policy.service.js';
import { RbacEvaluatorService } from './domain/services/rbac-evaluator.service.js';
import { InMemoryAuditRepository } from './repositories/in-memory/in-memory-audit-repository.js';
import { InMemoryRoleRepository } from './repositories/in-memory/in-memory-role-repository.js';
import { InMemorySessionRepository } from './repositories/in-memory/in-memory-session-repository.js';
import { InMemoryUserRepository } from './repositories/in-memory/in-memory-user-repository.js';
import { AssignUserRoleInput, AssignUserRoleUseCase } from './use-cases/assign-user-role.use-case.js';
import {
  AuthenticateUserInput,
  AuthenticateUserUseCase,
} from './use-cases/authenticate-user.use-case.js';
import {
  AuthorizeActionInput,
  AuthorizeActionUseCase,
  SupervisorOverrideInput,
} from './use-cases/authorize-action.use-case.js';
import {
  ChangeCredentialsUseCase,
  ChangePasswordInput,
  ChangePinInput,
} from './use-cases/change-credentials.use-case.js';
import {
  CreateRoleInput,
  ManageRoleUseCase,
  UpdateRoleInput,
} from './use-cases/manage-role.use-case.js';
import { RefreshSessionInput, RefreshSessionUseCase } from './use-cases/refresh-session.use-case.js';
import { RegisterUserInput, RegisterUserUseCase } from './use-cases/register-user.use-case.js';
import { RevokeSessionUseCase } from './use-cases/revoke-session.use-case.js';
import { VerifySessionInput, VerifySessionUseCase } from './use-cases/verify-session.use-case.js';

export interface AuthRbacModuleDeps {
  userRepo?: IUserRepository;
  roleRepo?: IRoleRepository;
  sessionRepo?: ISessionRepository;
  auditRepo?: IAuditRepository;
  passwordHasher?: IPasswordHasher;
  tokenGenerator?: ITokenGenerator;
  mfaVerifier?: IMfaVerifier;
  publishEvent?: AuthEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  lockoutPolicy?: LockoutPolicy;
  sessionPolicy?: SessionPolicy;
  passwordPolicy?: PasswordPolicy;
  evaluator?: RbacEvaluatorService;
  featureProfile?: AuthRbacFeatureProfile;
}

export function createAuthRbacModule(deps: AuthRbacModuleDeps = {}) {
  const userRepo = deps.userRepo ?? new InMemoryUserRepository();
  const roleRepo = deps.roleRepo ?? new InMemoryRoleRepository();
  const sessionRepo = deps.sessionRepo ?? new InMemorySessionRepository();
  const auditRepo = deps.auditRepo ?? new InMemoryAuditRepository();
  const clock = deps.clock ?? SystemClock;
  const features: AuthRbacFeatureFlags = resolveAuthRbacFeatures(deps.featureProfile);

  const requirePasswordHasher = (): IPasswordHasher => {
    if (!deps.passwordHasher) {
      throw new InvalidAuthInputError(
        'IPasswordHasher adapter is required for credential operations in createAuthRbacModule.'
      );
    }
    return deps.passwordHasher;
  };

  const requireTokenGenerator = (): ITokenGenerator => {
    if (!deps.tokenGenerator) {
      throw new InvalidAuthInputError(
        'ITokenGenerator adapter is required for token operations in createAuthRbacModule.'
      );
    }
    return deps.tokenGenerator;
  };

  const manageRoleUseCase = new ManageRoleUseCase({
    roleRepo,
    auditRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator: deps.idGenerator,
    features,
  });
  const assignUserRoleUseCase = new AssignUserRoleUseCase({
    userRepo,
    roleRepo,
    auditRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator: deps.idGenerator,
    features,
  });
  const authorizeActionUseCase = new AuthorizeActionUseCase({
    userRepo,
    roleRepo,
    passwordHasher: deps.passwordHasher,
    auditRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator: deps.idGenerator,
    lockoutPolicy: deps.lockoutPolicy,
    evaluator: deps.evaluator,
    features,
  });
  const revokeSessionUseCase = new RevokeSessionUseCase({
    sessionRepo,
    userRepo,
    auditRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator: deps.idGenerator,
    features,
  });

  const getRegisterUseCase = () =>
    new RegisterUserUseCase({
      userRepo,
      roleRepo,
      passwordHasher: requirePasswordHasher(),
      auditRepo,
      publishEvent: deps.publishEvent,
      clock,
      idGenerator: deps.idGenerator,
      passwordPolicy: deps.passwordPolicy,
      features,
    });

  const getAuthenticateUseCase = () =>
    new AuthenticateUserUseCase({
      userRepo,
      passwordHasher: requirePasswordHasher(),
      sessionRepo,
      tokenGenerator: deps.tokenGenerator,
      mfaVerifier: deps.mfaVerifier,
      auditRepo,
      publishEvent: deps.publishEvent,
      clock,
      idGenerator: deps.idGenerator,
      lockoutPolicy: deps.lockoutPolicy,
      sessionPolicy: deps.sessionPolicy,
      features,
    });

  const getVerifySessionUseCase = () =>
    new VerifySessionUseCase({
      sessionRepo,
      userRepo,
      tokenGenerator: requireTokenGenerator(),
      clock,
      features,
    });

  const getRefreshSessionUseCase = () =>
    new RefreshSessionUseCase({
      sessionRepo,
      userRepo,
      tokenGenerator: requireTokenGenerator(),
      auditRepo,
      publishEvent: deps.publishEvent,
      clock,
      idGenerator: deps.idGenerator,
      sessionPolicy: deps.sessionPolicy,
      features,
    });

  const getChangeCredentialsUseCase = () =>
    new ChangeCredentialsUseCase({
      userRepo,
      passwordHasher: requirePasswordHasher(),
      sessionRepo,
      auditRepo,
      clock,
      idGenerator: deps.idGenerator,
      passwordPolicy: deps.passwordPolicy,
      features,
    });

  return {
    features,
    repositories: { userRepo, roleRepo, sessionRepo, auditRepo },
    useCases: {
      manageRole: manageRoleUseCase,
      assignUserRole: assignUserRoleUseCase,
      authorizeAction: authorizeActionUseCase,
      revokeSession: revokeSessionUseCase,
    },
    registerUser: (input: RegisterUserInput) => getRegisterUseCase().execute(input),
    authenticate: (input: AuthenticateUserInput) => getAuthenticateUseCase().execute(input),
    verifySession: (input: VerifySessionInput) => getVerifySessionUseCase().execute(input),
    refreshSession: (input: RefreshSessionInput) => getRefreshSessionUseCase().execute(input),
    revokeSession: (sessionId: string, reason?: string, actorId?: string) =>
      revokeSessionUseCase.revokeOne(sessionId, reason, actorId),
    revokeAllUserSessions: (userId: string, reason?: string, actorId?: string) =>
      revokeSessionUseCase.revokeAllForUser(userId, reason, actorId),
    createRole: (input: CreateRoleInput) => manageRoleUseCase.createRole(input),
    updateRole: (input: UpdateRoleInput) => manageRoleUseCase.updateRole(input),
    deleteRole: (roleId: string, actorId?: string) => manageRoleUseCase.deleteRole(roleId, actorId),
    assignRole: (input: AssignUserRoleInput) => assignUserRoleUseCase.assignRole(input),
    revokeRole: (input: AssignUserRoleInput) => assignUserRoleUseCase.revokeRole(input),
    evaluatePermission: (input: AuthorizeActionInput) => authorizeActionUseCase.evaluate(input),
    assertPermission: (input: AuthorizeActionInput) => authorizeActionUseCase.assert(input),
    authorizeSupervisorOverride: (input: SupervisorOverrideInput) =>
      authorizeActionUseCase.authorizeSupervisorOverride(input),
    changePassword: (input: ChangePasswordInput) =>
      getChangeCredentialsUseCase().changePassword(input),
    changePin: (input: ChangePinInput) => getChangeCredentialsUseCase().changePin(input),
  };
}

export type AuthRbacModule = ReturnType<typeof createAuthRbacModule>;
