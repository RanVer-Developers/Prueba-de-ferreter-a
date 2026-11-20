import {
  Permission,
  PermissionSchema,
  Scope,
  parseWithAuthSchema,
} from '../../schemas/auth-rbac.schemas.js';

export function normalizePermission(input: string): Permission {
  return parseWithAuthSchema(PermissionSchema, input, 'permission');
}

/**
 * Evaluates whether a `granted` permission pattern covers a `required` permission.
 * Supports `*`, `*:*`, and trailing wildcard segments like `orders:*` or `orders:discount:*`.
 */
export function matchesPermission(granted: string, required: string): boolean {
  const g = granted.trim().toLowerCase();
  const r = required.trim().toLowerCase();

  if (g === '*' || g === '*:*') {
    return true;
  }
  if (g === r) {
    return true;
  }

  const grantedParts = g.split(':');
  const requiredParts = r.split(':');

  for (let i = 0; i < grantedParts.length; i++) {
    const gPart = grantedParts[i];
    if (gPart === '*') {
      // Trailing wildcard covers one or more remaining segments.
      if (i === grantedParts.length - 1) {
        return requiredParts.length >= grantedParts.length;
      }
      if (i >= requiredParts.length) {
        return false;
      }
      continue;
    }

    if (i >= requiredParts.length || gPart !== requiredParts[i]) {
      return false;
    }
  }

  return grantedParts.length === requiredParts.length;
}

export function hasMatchingPermission(grantedList: ReadonlyArray<string>, required: string): string | undefined {
  for (const granted of grantedList) {
    if (matchesPermission(granted, required)) {
      return granted;
    }
  }
  return undefined;
}

export function normalizeScope(scope?: Scope): Scope | undefined {
  if (!scope) return undefined;
  const tenantId = scope.tenantId?.trim() || undefined;
  const branchId = scope.branchId?.trim() || undefined;
  if (!tenantId && !branchId) return undefined;
  return {
    ...(tenantId ? { tenantId } : {}),
    ...(branchId ? { branchId } : {}),
  };
}

export function sameScope(a?: Scope, b?: Scope): boolean {
  const normA = normalizeScope(a);
  const normB = normalizeScope(b);
  return normA?.tenantId === normB?.tenantId && normA?.branchId === normB?.branchId;
}

/**
 * Determines whether a role assignment scope covers the target execution scope.
 * - Global assignment (`undefined` or empty) applies to any target scope.
 * - Tenant assignment applies to that tenant and any branch within that tenant.
 * - Tenant + Branch assignment applies only when both match.
 */
export function scopeMatches(assignmentScope: Scope | undefined, targetScope: Scope | undefined): boolean {
  const a = normalizeScope(assignmentScope);
  if (!a) {
    return true;
  }
  const t = normalizeScope(targetScope);
  if (a.tenantId && a.tenantId !== t?.tenantId) {
    return false;
  }
  if (a.branchId && a.branchId !== t?.branchId) {
    return false;
  }
  return true;
}
