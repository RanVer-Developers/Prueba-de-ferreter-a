import { z } from 'zod';
import { InvalidAuthInputError } from '../domain/errors/auth-rbac-errors.js';

export const AUTH_RBAC_SCHEMA_VERSION = 1 as const;

const PERMISSION_REGEX =
  /^(\*|\*:\*|[a-z0-9][a-z0-9._-]*:(\*|[a-z0-9][a-z0-9._-]*(?::(?:\*|[a-z0-9][a-z0-9._-]*))*))$/;

export const NonEmptyIdSchema = z.string().trim().min(1, 'Identifier cannot be empty.');

export const UsernameSchema = z
  .string()
  .trim()
  .min(2, 'Username must be at least 2 characters.')
  .max(64, 'Username cannot exceed 64 characters.')
  .transform((v) => v.toLowerCase());

export const EmailSchema = z
  .string()
  .trim()
  .email('Invalid email format.')
  .transform((v) => v.toLowerCase());

export const PermissionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    PERMISSION_REGEX,
    "Permission must follow 'resource:action', 'resource:*', '*', or '*:*' format."
  );

export type Permission = z.infer<typeof PermissionSchema>;

export const RoleCodeSchema = z
  .string()
  .trim()
  .min(2, 'Role code must be at least 2 characters.')
  .max(48, 'Role code cannot exceed 48 characters.')
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z0-9_-]+$/.test(v), 'Role code may only contain A-Z, 0-9, _ and -.');

export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const ScopeSchema = z
  .object({
    tenantId: NonEmptyIdSchema.optional(),
    branchId: NonEmptyIdSchema.optional(),
  })
  .strict()
  .refine((s) => !s.branchId || Boolean(s.tenantId), {
    message: 'branchId cannot be specified without tenantId.',
  });

export type Scope = z.infer<typeof ScopeSchema>;

export const RoleAssignmentSchema = z.object({
  roleId: NonEmptyIdSchema,
  scope: ScopeSchema.optional(),
  assignedAt: z.string().datetime(),
  assignedBy: NonEmptyIdSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

export const DirectPermissionsSchema = z.object({
  allow: z.array(PermissionSchema).default([]),
  deny: z.array(PermissionSchema).default([]),
  scope: ScopeSchema.optional(),
});

export type DirectPermissions = z.infer<typeof DirectPermissionsSchema>;

export const UserStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED']);

export type UserStatus = z.infer<typeof UserStatusSchema>;

const SafeMetadataSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .refine(
    (record) =>
      !Object.keys(record).some(
        (k) => k === '__proto__' || k === 'constructor' || k === 'prototype'
      ),
    { message: 'Metadata contains forbidden prototype keys.' }
  );

export const AuthUserJSONSchema = z.object({
  schemaVersion: z.literal(AUTH_RBAC_SCHEMA_VERSION).default(AUTH_RBAC_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  username: UsernameSchema,
  email: EmailSchema.optional(),
  displayName: z.string().trim().min(1, 'Display name is required.'),
  status: UserStatusSchema.default('ACTIVE'),
  passwordHash: z.string().min(1).optional(),
  pinHash: z.string().min(1).optional(),
  assignments: z.array(RoleAssignmentSchema).default([]),
  directPermissions: DirectPermissionsSchema.default({ allow: [], deny: [] }),
  failedAttempts: z.number().int().min(0).default(0),
  lockedUntil: z.string().datetime().optional(),
  mfaRequired: z.boolean().default(false),
  tokenVersion: z.number().int().min(1).default(1),
  metadata: SafeMetadataSchema.optional(),
  persistedVersion: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AuthUserJSON = z.infer<typeof AuthUserJSONSchema>;

export const RoleJSONSchema = z.object({
  schemaVersion: z.literal(AUTH_RBAC_SCHEMA_VERSION).default(AUTH_RBAC_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  code: RoleCodeSchema,
  name: z.string().trim().min(1, 'Role name is required.'),
  description: z.string().trim().min(1).optional(),
  permissions: z.array(PermissionSchema).default([]),
  deniedPermissions: z.array(PermissionSchema).default([]),
  inheritsFrom: z.array(NonEmptyIdSchema).default([]),
  isSystem: z.boolean().default(false),
  persistedVersion: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RoleJSON = z.infer<typeof RoleJSONSchema>;

export const SessionStatusSchema = z.enum(['ACTIVE', 'REVOKED']);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AuthSessionJSONSchema = z.object({
  schemaVersion: z.literal(AUTH_RBAC_SCHEMA_VERSION).default(AUTH_RBAC_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  userId: NonEmptyIdSchema,
  tokenHash: z.string().min(1, 'Token hash is required.'),
  refreshTokenHash: z.string().min(1).optional(),
  tokenVersion: z.number().int().min(1),
  scope: ScopeSchema.optional(),
  status: SessionStatusSchema.default('ACTIVE'),
  deviceId: NonEmptyIdSchema.optional(),
  ipAddress: z.string().trim().min(1).optional(),
  userAgent: z.string().trim().min(1).optional(),
  persistedVersion: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  refreshExpiresAt: z.string().datetime().optional(),
  lastActivityAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
  revokedReason: z.string().trim().min(1).optional(),
});

export type AuthSessionJSON = z.infer<typeof AuthSessionJSONSchema>;

export const AuditOutcomeSchema = z.enum(['ALLOW', 'DENY', 'SUCCESS', 'FAILURE']);

export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditEntryJSONSchema = z.object({
  schemaVersion: z.literal(AUTH_RBAC_SCHEMA_VERSION).default(AUTH_RBAC_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  action: z.string().trim().min(1),
  actorId: NonEmptyIdSchema.optional(),
  targetUserId: NonEmptyIdSchema.optional(),
  permission: PermissionSchema.optional(),
  scope: ScopeSchema.optional(),
  outcome: AuditOutcomeSchema,
  reason: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime(),
});

export type AuditEntryJSON = z.infer<typeof AuditEntryJSONSchema>;

export function parseWithAuthSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  context: string
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
    throw new InvalidAuthInputError(`Invalid ${context}: ${summary}`, issues);
  }
  return result.data;
}
