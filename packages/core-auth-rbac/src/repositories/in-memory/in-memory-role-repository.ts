import { IRoleRepository } from '../../contracts/auth-contracts.js';
import { Role } from '../../domain/entities/role.js';
import { ConcurrencyError, DuplicateRoleError } from '../../domain/errors/auth-rbac-errors.js';
import { InMemoryRepositoryOptions } from './in-memory-user-repository.js';

export class InMemoryRoleRepository implements IRoleRepository {
  private readonly roles = new Map<string, Role>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  public async findById(id: string): Promise<Role | null> {
    const role = this.roles.get(id);
    return role ? this.cloneIfNeeded(role) : null;
  }

  public async findByCode(code: string): Promise<Role | null> {
    const normalized = code.trim().toUpperCase();
    for (const role of this.roles.values()) {
      if (role.code === normalized) {
        return this.cloneIfNeeded(role);
      }
    }
    return null;
  }

  public async findByIds(ids: ReadonlyArray<string>): Promise<Role[]> {
    const result: Role[] = [];
    for (const id of ids) {
      const role = this.roles.get(id);
      if (role) {
        result.push(this.cloneIfNeeded(role));
      }
    }
    return result;
  }

  public async listAll(): Promise<Role[]> {
    return Array.from(this.roles.values()).map((r) => this.cloneIfNeeded(r));
  }

  public async save(role: Role): Promise<void> {
    const existing = this.roles.get(role.id);
    if (existing && existing.persistedVersion !== role.persistedVersion) {
      throw new ConcurrencyError('role', role.id, role.persistedVersion, existing.persistedVersion);
    }

    for (const other of this.roles.values()) {
      if (other.id !== role.id && other.code === role.code) {
        throw new DuplicateRoleError('code', role.code);
      }
    }

    role.markPersisted();
    this.roles.set(role.id, this.cloneIfNeeded(role));
  }

  public async delete(id: string): Promise<void> {
    this.roles.delete(id);
  }

  public clear(): void {
    this.roles.clear();
  }

  private cloneIfNeeded(role: Role): Role {
    return this.isolate ? Role.fromJSON(role.toJSON()) : role;
  }
}
