# `@modulos/core-auth-rbac`

Módulo agnóstico (headless) de dominio puro en TypeScript estricto para autenticación, gestión de sesiones, control de acceso basado en roles (RBAC) con permisos granulares, alcance multi-tenant/sucursal y aprobación de supervisor.

## Características Principales

- **Autenticación Agnóstica de Plataforma:** Soporta credenciales por contraseña (`PASSWORD`) y PIN rápido de mostrador (`PIN`) delegando hashing y generación de tokens a puertos inyectables (`IPasswordHasher`, `ITokenGenerator`).
- **Seguridad Activa y Protección contra Fuerza Bruta:** Conteo de intentos fallidos, bloqueo temporal (`lockedUntil`), desbloqueo automático al expirar el periodo y `tokenVersion` para invalidación inmediata de sesiones tras cambio de contraseña o revocación de roles.
- **Motor RBAC Granular:** Permisos `resource:action` con comodines (`orders:*`, `orders:discount:*`, `*:*`), herencia entre roles con detección de ciclos (`CyclicRoleInheritanceError`), permisos directos y precedencia estricta de denegación explícita (`explicitDeny`).
- **Multi-Tenant y Multi-Sucursal:** Asignaciones de rol globales, por `tenantId` o por `{ tenantId, branchId }`.
- **Autorización de Supervisor (`SupervisorOverride`):** Flujo de aprobación elevada con verificación de credenciales (PIN/contraseña) y prohibición estricta de autoaprobación (`SelfApprovalNotAllowedError`).
- **Validación y Versionado con Zod:** Esquemas Zod en fronteras y rehidratación de snapshots (`schemaVersion: 1`), concurrencia optimista (`ConcurrencyError`) y eventos de dominio/auditoría.

## Perfiles (`AuthRbacTier`) y Feature Flags

| Feature | `BASIC` | `INTERMEDIATE` | `ADVANCED` |
| :--- | :---: | :---: | :---: |
| `granularPermissions` | ❌ | ✅ | ✅ |
| `explicitDeny` | ❌ | ❌ | ✅ |
| `roleInheritance` | ❌ | ✅ | ✅ |
| `scopedRoles` | ❌ | ❌ | ✅ |
| `pinAuth` | ✅ | ✅ | ✅ |
| `sessionManagement` | ✅ | ✅ | ✅ |
| `refreshTokens` | ❌ | ✅ | ✅ |
| `bruteForceProtection` | ❌ | ✅ | ✅ |
| `supervisorOverride` | ❌ | ✅ | ✅ |
| `optimisticConcurrency` | ✅ | ✅ | ✅ |
| `auditTrail` | ❌ | ✅ | ✅ |

## Ejemplo de Uso

```ts
import {
  AuthenticateUserUseCase,
  AuthorizeActionUseCase,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  ManageRoleUseCase,
  RegisterUserUseCase,
} from '@modulos/core-auth-rbac';

const userRepo = new InMemoryUserRepository();
const roleRepo = new InMemoryRoleRepository();
const sessionRepo = new InMemorySessionRepository();

const manageRole = new ManageRoleUseCase({ roleRepo });
await manageRole.createRole({
  id: 'role-cashier',
  code: 'CASHIER',
  name: 'Cajero',
  permissions: ['cashier:sale', 'orders:create'],
});

const register = new RegisterUserUseCase({ userRepo, roleRepo, passwordHasher });
await register.execute({
  id: 'usr-1',
  username: 'ana',
  displayName: 'Ana López',
  password: 'SecretPassword123',
  pin: '4829',
  initialRoles: [{ roleId: 'role-cashier', scope: { tenantId: 't1', branchId: 'b1' } }],
});

const authenticate = new AuthenticateUserUseCase({
  userRepo,
  passwordHasher,
  sessionRepo,
  tokenGenerator,
});
const { accessToken } = await authenticate.execute({
  identifier: 'ana',
  secret: 'SecretPassword123',
});

const authorize = new AuthorizeActionUseCase({ userRepo, roleRepo, passwordHasher });
await authorize.assert({
  userId: 'usr-1',
  permission: 'cashier:sale',
  scope: { tenantId: 't1', branchId: 'b1' },
});
```
