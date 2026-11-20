import { Permission, Scope } from '../../schemas/auth-rbac.schemas.js';

export type AuthMethod = 'PASSWORD' | 'PIN';

export interface AuthRbacDomainEventBase {
  readonly occurredAt: string;
}

export interface UserRegisteredEvent extends AuthRbacDomainEventBase {
  readonly type: 'UserRegistered';
  readonly userId: string;
  readonly username: string;
}

export interface UserAuthenticatedEvent extends AuthRbacDomainEventBase {
  readonly type: 'UserAuthenticated';
  readonly userId: string;
  readonly method: AuthMethod;
  readonly sessionId?: string;
}

export interface AuthenticationFailedEvent extends AuthRbacDomainEventBase {
  readonly type: 'AuthenticationFailed';
  readonly identifier: string;
  readonly userId?: string;
  readonly method: AuthMethod;
  readonly reason: string;
  readonly failedAttempts?: number;
}

export interface UserLockedEvent extends AuthRbacDomainEventBase {
  readonly type: 'UserLocked';
  readonly userId: string;
  readonly lockedUntil?: string;
  readonly failedAttempts: number;
}

export interface SessionCreatedEvent extends AuthRbacDomainEventBase {
  readonly type: 'SessionCreated';
  readonly sessionId: string;
  readonly userId: string;
  readonly scope?: Scope;
}

export interface SessionRefreshedEvent extends AuthRbacDomainEventBase {
  readonly type: 'SessionRefreshed';
  readonly sessionId: string;
  readonly userId: string;
}

export interface SessionRevokedEvent extends AuthRbacDomainEventBase {
  readonly type: 'SessionRevoked';
  readonly sessionId: string;
  readonly userId: string;
  readonly reason?: string;
}

export interface AllUserSessionsRevokedEvent extends AuthRbacDomainEventBase {
  readonly type: 'AllUserSessionsRevoked';
  readonly userId: string;
  readonly reason?: string;
}

export interface RoleSavedEvent extends AuthRbacDomainEventBase {
  readonly type: 'RoleSaved';
  readonly roleId: string;
  readonly code: string;
}

export interface UserRoleAssignedEvent extends AuthRbacDomainEventBase {
  readonly type: 'UserRoleAssigned';
  readonly userId: string;
  readonly roleId: string;
  readonly scope?: Scope;
  readonly assignedBy?: string;
}

export interface UserRoleRevokedEvent extends AuthRbacDomainEventBase {
  readonly type: 'UserRoleRevoked';
  readonly userId: string;
  readonly roleId: string;
  readonly scope?: Scope;
}

export interface SupervisorOverrideAuthorizedEvent extends AuthRbacDomainEventBase {
  readonly type: 'SupervisorOverrideAuthorized';
  readonly requesterId: string;
  readonly approverId: string;
  readonly permission: Permission;
  readonly scope?: Scope;
}

export type AuthRbacDomainEvent =
  | UserRegisteredEvent
  | UserAuthenticatedEvent
  | AuthenticationFailedEvent
  | UserLockedEvent
  | SessionCreatedEvent
  | SessionRefreshedEvent
  | SessionRevokedEvent
  | AllUserSessionsRevokedEvent
  | RoleSavedEvent
  | UserRoleAssignedEvent
  | UserRoleRevokedEvent
  | SupervisorOverrideAuthorizedEvent;
