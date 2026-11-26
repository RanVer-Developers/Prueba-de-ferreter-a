// Schemas & Validation
export * from './schemas/auth-rbac.schemas.js';

// Contracts
export * from './contracts/auth-contracts.js';

// Domain - Errors
export * from './domain/errors/auth-rbac-errors.js';

// Domain - Value Objects
export * from './domain/value-objects/permission.js';

// Domain - Services
export * from './domain/services/auth-features.js';
export * from './domain/services/password-policy.service.js';
export * from './domain/services/rbac-evaluator.service.js';

// Domain - Entities & Events
export * from './domain/entities/role.js';
export * from './domain/entities/user.js';
export * from './domain/entities/session.js';
export * from './domain/events/auth-rbac-events.js';

// Repositories - InMemory Adapters
export * from './repositories/in-memory/in-memory-user-repository.js';
export * from './repositories/in-memory/in-memory-role-repository.js';
export * from './repositories/in-memory/in-memory-session-repository.js';
export * from './repositories/in-memory/in-memory-audit-repository.js';

// Use Cases
export * from './use-cases/register-user.use-case.js';
export * from './use-cases/authenticate-user.use-case.js';
export * from './use-cases/verify-session.use-case.js';
export * from './use-cases/refresh-session.use-case.js';
export * from './use-cases/revoke-session.use-case.js';
export * from './use-cases/manage-role.use-case.js';
export * from './use-cases/assign-user-role.use-case.js';
export * from './use-cases/authorize-action.use-case.js';
export * from './use-cases/change-credentials.use-case.js';
export * from './auth-rbac-module.js';
