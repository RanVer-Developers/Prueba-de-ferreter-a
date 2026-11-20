import { IUserRepository } from '../../contracts/auth-contracts.js';
import { AuthUser } from '../../domain/entities/user.js';
import { ConcurrencyError, DuplicateUserError } from '../../domain/errors/auth-rbac-errors.js';

export interface InMemoryRepositoryOptions {
  isolate?: boolean;
}

export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, AuthUser>();
  private readonly isolate: boolean;

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  public async findById(id: string): Promise<AuthUser | null> {
    const user = this.users.get(id);
    if (!user) return null;
    return this.cloneIfNeeded(user);
  }

  public async findByUsername(username: string): Promise<AuthUser | null> {
    const normalized = username.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.username === normalized) {
        return this.cloneIfNeeded(user);
      }
    }
    return null;
  }

  public async findByEmail(email: string): Promise<AuthUser | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return this.cloneIfNeeded(user);
      }
    }
    return null;
  }

  public async save(user: AuthUser): Promise<void> {
    const existing = this.users.get(user.id);
    if (existing && existing.persistedVersion !== user.persistedVersion) {
      throw new ConcurrencyError('user', user.id, user.persistedVersion, existing.persistedVersion);
    }

    for (const other of this.users.values()) {
      if (other.id === user.id) continue;
      if (other.username === user.username) {
        throw new DuplicateUserError('username', user.username);
      }
      if (user.email && other.email === user.email) {
        throw new DuplicateUserError('email', user.email);
      }
    }

    user.markPersisted();
    this.users.set(user.id, this.cloneIfNeeded(user));
  }

  public clear(): void {
    this.users.clear();
  }

  private cloneIfNeeded(user: AuthUser): AuthUser {
    return this.isolate ? AuthUser.fromJSON(user.toJSON()) : user;
  }
}
