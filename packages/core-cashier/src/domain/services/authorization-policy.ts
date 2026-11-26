import {
  InsufficientRoleError,
  SelfApprovalNotAllowedError,
  SupervisorApprovalRequiredError,
} from '../errors/cashier-errors.js';

/**
 * Roles estándar reconocidos por la política por defecto.
 * `UserSummary.role` es un string libre: cualquier proyecto puede usar sus propios roles
 * implementando `IAuthorizationPolicy`.
 */
export const UserRole = {
  CASHIER: 'CASHIER',
  SUPERVISOR: 'SUPERVISOR',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;

export type AuthorizedAction =
  | 'VOID'
  | 'REFUND'
  | 'RESUME'
  | 'FORCE_CLOSE_LOCKED'
  | 'CLOSE_WITH_DISCREPANCY'
  | 'AUDIT_COUNT'
  | 'HANDOVER'
  | 'OPEN_DRAWER_NO_SALE';

export interface AuthorizationActor {
  readonly id: string;
  readonly name?: string;
  readonly role?: string;
}

/**
 * Puerto de autorización: decide si `approver` puede aprobar `action` solicitada por `requester`.
 * Debe lanzar un error de dominio si no está permitido.
 */
export interface IAuthorizationPolicy {
  assertCanAuthorize(action: AuthorizedAction, approver: AuthorizationActor | undefined, requester?: AuthorizationActor): void;
}

export interface SupervisorPolicyOptions {
  allowedRoles?: string[];
  /**
   * Si es true (por defecto), exige que `approver.role` venga siempre informado y pertenezca a `allowedRoles`.
   * Para flujos que validan roles externamente, usa `IdentityOnlyAuthorizationPolicy` o `{ requireExplicitRole: false }`.
   */
  requireExplicitRole?: boolean;
}

/**
 * Política por defecto:
 *  - El aprobador debe estar identificado.
 *  - No se permite la autoaprobación (`approver.id === requester.id`).
 *  - Exige rol explícito perteneciente a SUPERVISOR, MANAGER o ADMIN (configurable).
 */
export class SupervisorAuthorizationPolicy implements IAuthorizationPolicy {
  private readonly allowedRoles: ReadonlySet<string>;
  private readonly requireExplicitRole: boolean;

  public constructor(
    allowedRolesOrOptions: string[] | SupervisorPolicyOptions = [UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.ADMIN]
  ) {
    if (Array.isArray(allowedRolesOrOptions)) {
      this.allowedRoles = new Set(allowedRolesOrOptions.map((r) => r.toUpperCase()));
      this.requireExplicitRole = true;
    } else {
      const roles = allowedRolesOrOptions.allowedRoles ?? [UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.ADMIN];
      this.allowedRoles = new Set(roles.map((r) => r.toUpperCase()));
      this.requireExplicitRole = allowedRolesOrOptions.requireExplicitRole ?? true;
    }
  }

  public assertCanAuthorize(
    action: AuthorizedAction,
    approver: AuthorizationActor | undefined,
    requester?: AuthorizationActor
  ): void {
    if (!approver || !approver.id || approver.id.trim().length === 0) {
      throw new SupervisorApprovalRequiredError(action, 'Debe identificarse al supervisor que autoriza.');
    }
    if (requester && requester.id === approver.id) {
      throw new SelfApprovalNotAllowedError(approver.id, action);
    }
    if (approver.role !== undefined) {
      if (!approver.role || !this.allowedRoles.has(approver.role.toUpperCase())) {
        throw new InsufficientRoleError(approver.id, action, approver.role);
      }
    } else if (this.requireExplicitRole) {
      throw new InsufficientRoleError(approver.id, action, undefined);
    }
  }
}

/**
 * Política permisiva para proyectos que ya validan roles aguas arriba (API / IAM propio).
 * Mantiene únicamente la regla de integridad: el aprobador existe y no es el mismo solicitante.
 */
export class IdentityOnlyAuthorizationPolicy implements IAuthorizationPolicy {
  public assertCanAuthorize(
    action: AuthorizedAction,
    approver: AuthorizationActor | undefined,
    requester?: AuthorizationActor
  ): void {
    if (!approver || !approver.id || approver.id.trim().length === 0) {
      throw new SupervisorApprovalRequiredError(action, 'Debe identificarse al supervisor que autoriza.');
    }
    if (requester && requester.id === approver.id) {
      throw new SelfApprovalNotAllowedError(approver.id, action);
    }
  }
}
