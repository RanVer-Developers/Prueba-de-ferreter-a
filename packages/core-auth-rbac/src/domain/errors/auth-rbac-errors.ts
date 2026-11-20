/**
 * Base domain error for all exceptions in the auth & RBAC module.
 */
export class AuthRbacDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidAuthInputError extends AuthRbacDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class UserNotFoundError extends AuthRbacDomainError {
  constructor(identifier: string) {
    super(`User '${identifier}' was not found.`);
  }
}

export class DuplicateUserError extends AuthRbacDomainError {
  constructor(field: 'id' | 'username' | 'email', value: string) {
    super(`User with ${field} '${value}' already exists.`);
  }
}

export class RoleNotFoundError extends AuthRbacDomainError {
  constructor(identifier: string) {
    super(`Role '${identifier}' was not found.`);
  }
}

export class DuplicateRoleError extends AuthRbacDomainError {
  constructor(field: 'id' | 'code', value: string) {
    super(`Role with ${field} '${value}' already exists.`);
  }
}

export class SystemRoleImmutableError extends AuthRbacDomainError {
  constructor(roleId: string, operation: string) {
    super(`Cannot execute '${operation}' on protected system role '${roleId}'.`);
  }
}

export class CyclicRoleInheritanceError extends AuthRbacDomainError {
  constructor(roleId: string, parentRoleId: string) {
    super(`Cyclic role inheritance detected between '${roleId}' and '${parentRoleId}'.`);
  }
}

export class InvalidCredentialsError extends AuthRbacDomainError {
  constructor(reason = 'Invalid authentication credentials.') {
    super(reason);
  }
}

export class AccountLockedError extends AuthRbacDomainError {
  public readonly lockedUntil?: string;

  constructor(userId: string, lockedUntil?: string) {
    super(
      lockedUntil
        ? `Account '${userId}' is temporarily locked until ${lockedUntil}.`
        : `Account '${userId}' is locked.`
    );
    this.lockedUntil = lockedUntil;
  }
}

export class UserNotActiveError extends AuthRbacDomainError {
  public readonly status: string;

  constructor(userId: string, status: string) {
    super(`User '${userId}' is not active (current status: '${status}').`);
    this.status = status;
  }
}

export class SessionNotFoundError extends AuthRbacDomainError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' was not found.`);
  }
}

export class SessionInvalidError extends AuthRbacDomainError {
  constructor(reason: string) {
    super(`Session is invalid: ${reason}`);
  }
}

export class AccessDeniedError extends AuthRbacDomainError {
  public readonly permission: string;
  public readonly reason: string;

  constructor(permission: string, reason: string) {
    super(`Access denied for permission '${permission}': ${reason}`);
    this.permission = permission;
    this.reason = reason;
  }
}

export class SelfApprovalNotAllowedError extends AuthRbacDomainError {
  constructor(actorId: string, permission: string) {
    super(`Actor '${actorId}' cannot self-approve elevated action '${permission}'.`);
  }
}

export class SupervisorApprovalRequiredError extends AuthRbacDomainError {
  constructor(permission: string, reason = 'Supervisor approval is required for this action.') {
    super(`Supervisor approval required for '${permission}': ${reason}`);
  }
}

export class ConcurrencyError extends AuthRbacDomainError {
  constructor(entityType: string, entityId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Concurrency conflict on ${entityType} '${entityId}': expected persisted version ${expectedVersion}, found ${currentVersion}.`
    );
  }
}

export class FeatureDisabledError extends AuthRbacDomainError {
  public readonly feature: string;

  constructor(feature: string, details?: string) {
    super(
      details
        ? `Feature '${feature}' is disabled in the active profile: ${details}`
        : `Feature '${feature}' is disabled in the active auth/RBAC profile.`
    );
    this.feature = feature;
  }
}
